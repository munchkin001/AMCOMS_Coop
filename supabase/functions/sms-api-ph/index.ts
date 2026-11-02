import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin'
};

const jsonResponse = (body: Record<string, unknown>, status: number, origin: string) => new Response(
  JSON.stringify(body),
  { status, headers: { ...corsHeaders, 'Access-Control-Allow-Origin': origin, 'Content-Type': 'application/json' } }
);

const isLocalDevOrigin = (value: string) => {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' || !['4173', '5173', '5174'].includes(url.port)) return false;
    return ['localhost', '127.0.0.1'].includes(url.hostname)
      || /^10\./.test(url.hostname)
      || /^192\.168\./.test(url.hostname)
      || /^172\.(1[6-9]|2\d|3[01])\./.test(url.hostname);
  } catch {
    return false;
  }
};

const normalizePhone = (value: string) => {
  let digits = value.replace(/[\s()-]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (digits.startsWith('09') && digits.length === 11) digits = `63${digits.slice(1)}`;
  if (!/^639\d{9}$/.test(digits)) return null;
  return `+${digits}`;
};

const getRecipients = async (admin: ReturnType<typeof createClient>, groups: string[]) => {
  const allowedGroups = new Set(['allMembers', 'recentMembers', 'manager', 'treasurer', 'bookkeeper', 'inventoryStaff']);
  if (!groups.length || groups.some((group) => !allowedGroups.has(group))) {
    throw new Error('Select at least one valid recipient group.');
  }

  const recipients: Array<{ name: string; phone: string }> = [];
  const staffRoles = groups.flatMap((group) => ({
    manager: ['manager'],
    treasurer: ['treasurer'],
    bookkeeper: ['bookkeeper'],
    inventoryStaff: ['inventory']
  }[group] || []));

  if (groups.includes('allMembers') || groups.includes('recentMembers')) {
    let query = admin.from('members')
      .select('first_name, middle_name, last_name, phone')
      .eq('membership_status', 'active')
      .not('phone', 'is', null);
    if (groups.includes('recentMembers') && !groups.includes('allMembers')) {
      const sinceDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      query = query.gte('date_joined', sinceDate);
    }
    const { data, error } = await query;
    if (error) throw error;
    for (const member of data || []) {
      recipients.push({
        name: [member.first_name, member.middle_name, member.last_name].filter(Boolean).join(' '),
        phone: member.phone
      });
    }
  }

  if (staffRoles.length) {
    const { data, error } = await admin.from('staff')
      .select('full_name, phone')
      .eq('is_active', true)
      .in('role', [...new Set(staffRoles)])
      .not('phone', 'is', null);
    if (error) throw error;
    for (const staff of data || []) recipients.push({ name: staff.full_name, phone: staff.phone });
  }

  const uniqueRecipients = new Map<string, { name: string; phone: string }>();
  for (const recipient of recipients) {
    const phone = normalizePhone(recipient.phone || '');
    if (phone && !uniqueRecipients.has(phone)) uniqueRecipients.set(phone, { ...recipient, phone });
  }
  return [...uniqueRecipients.values()];
};

Deno.serve(async (request: Request) => {
  const origin = request.headers.get('origin') || '';
  const configuredAppUrl = Deno.env.get('APP_URL')?.replace(/\/$/, '');
  const allowedOrigins = new Set([
    configuredAppUrl,
    'https://amci-staff.vercel.app',
    'http://localhost:4173',
    'http://127.0.0.1:4173',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5174'
  ].filter(Boolean));
  if (!allowedOrigins.has(origin) && !isLocalDevOrigin(origin)) {
    return new Response('Origin is not allowed.', { status: 403 });
  }
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: { ...corsHeaders, 'Access-Control-Allow-Origin': origin } });
  }
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405, origin);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: 'SMS service is not configured.' }, 500, origin);
  }

  const authorization = request.headers.get('Authorization');
  if (!authorization) return jsonResponse({ error: 'Authentication is required.' }, 401, origin);

  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

  try {
    const { data: authData, error: authError } = await caller.auth.getUser();
    if (authError || !authData.user) return jsonResponse({ error: 'Authentication is required.' }, 401, origin);

    const { data: actor, error: actorError } = await caller.from('staff')
      .select('id, role, is_active')
      .eq('user_id', authData.user.id)
      .maybeSingle();
    if (actorError || !actor?.is_active || !['manager', 'chairman'].includes(actor.role)) {
      return jsonResponse({ error: 'Only active Managers or Chairmen can send SMS.' }, 403, origin);
    }

    const payload = await request.json();
    const apiKey = Deno.env.get('SMSPH_API_KEY');
    if (!apiKey) return jsonResponse({ error: 'SMS API PH is not configured on the server.' }, 503, origin);
    if (payload?.action === 'balance') {
      return jsonResponse({ error: 'SMS API PH does not provide a credit-balance endpoint.' }, 400, origin);
    }

    const message = String(payload?.message || '').trim();
    if (!message || message.length > 2000) {
      return jsonResponse({ error: 'Enter a message between 1 and 2,000 characters.' }, 400, origin);
    }

    let recipients: Array<{ name: string; phone: string }>;
    if (payload?.action === 'send') {
      const phone = normalizePhone(String(payload?.phone || ''));
      if (!phone) return jsonResponse({ error: 'Enter a valid Philippine mobile number, such as 09XXXXXXXXX.' }, 400, origin);
      recipients = [{ name: String(payload?.recipient_name || '').trim(), phone }];
    } else if (payload?.action === 'send-group') {
      recipients = await getRecipients(admin, Array.isArray(payload?.groups) ? payload.groups : []);
    } else {
      return jsonResponse({ error: 'Unsupported SMS action.' }, 400, origin);
    }

    if (!recipients.length) return jsonResponse({ error: 'No active recipients have valid mobile numbers.' }, 400, origin);
    if (recipients.length > 500) return jsonResponse({ error: 'SMS API PH supports at most 500 recipients per request.' }, 400, origin);

    const sender = Deno.env.get('SMSPH_SENDER_NAME')?.trim() || 'AMCOMS';
    const { data: logRows, error: logError } = await admin.from('sms_logs').insert(recipients.map((recipient) => ({
      recipient_name: recipient.name || null,
      phone_number: recipient.phone,
      message,
      notification_type: payload.action === 'send-group' ? 'announcement' : 'manual',
      status: 'pending',
      provider: 'sms_api_ph'
    }))).select('id, phone_number');
    if (logError || !logRows?.length) {
      console.error('Unable to create SMS audit rows.');
      return jsonResponse({ error: 'SMS could not be recorded, so it was not sent.' }, 500, origin);
    }

    let sentCount = 0;
    let failedCount = 0;
    let firstProviderError = '';
    for (const row of logRows) {
      let httpStatus: number | null = null;
      let providerBody: Record<string, unknown> | null = null;
      let sendError = '';
      try {
        const response = await fetch('https://smsapiph.onrender.com/api/v1/send/sms', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey
          },
          body: JSON.stringify({
            recipient: row.phone_number,
            message,
            sender
          }),
          signal: AbortSignal.timeout(20000)
        });
        httpStatus = response.status;
        const responseBody: unknown = await response.json().catch(() => null);
        providerBody = responseBody && typeof responseBody === 'object' && !Array.isArray(responseBody)
          ? responseBody as Record<string, unknown>
          : null;
        if (!response.ok || providerBody?.success !== true) {
          sendError = typeof providerBody?.error === 'string'
            ? providerBody.error
            : 'SMS API PH rejected the SMS request.';
        }
      } catch {
        sendError = 'SMS API PH could not be reached. The message was not confirmed as sent.';
      }

      const wasSent = !sendError;
      const { error: updateError } = await admin.from('sms_logs').update({
        status: wasSent ? 'sent' : 'failed',
        provider_response: { http_status: httpStatus, response: providerBody, error: sendError || null }
      }).eq('id', row.id);
      if (updateError) {
        console.error('Unable to update SMS log status.');
        return jsonResponse({ error: 'SMS delivery was attempted, but its result could not be recorded.' }, 500, origin);
      }

      if (wasSent) sentCount++;
      else {
        failedCount++;
        if (!firstProviderError) firstProviderError = sendError;
      }
    }

    if (sentCount === 0) return jsonResponse({ error: firstProviderError || 'SMS delivery failed.' }, 502, origin);
    return jsonResponse({ sent_count: sentCount, failed_count: failedCount }, 200, origin);
  } catch (error) {
    console.error('SMS API PH action failed.');
    return jsonResponse({ error: error instanceof Error ? error.message : 'The SMS request could not be completed.' }, 400, origin);
  }
});

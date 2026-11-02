// deno-lint-ignore-file
/// <reference lib="deno.ns" />

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
    if (url.protocol !== 'http:') return false;
    // Allow both 5173 and 5174 for Vite dev server
    if (url.port !== '5173' && url.port !== '5174') return false;
    const host = url.hostname;
    return host === 'localhost'
      || host === '127.0.0.1'
      || /^10\./.test(host)
      || /^192\.168\./.test(host)
      || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  } catch {
    return false;
  }
};

const normalizePhone = (value: string) => {
  let digits = value.replace(/[\s()-]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (digits.startsWith('09') && digits.length === 11) digits = `63${digits.slice(1)}`;
  if (!/^639\d{9}$/.test(digits)) return null;
  return digits;
};

const hasInsufficientCreditError = (value: unknown) => {
  const responseText = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  return /insufficient.{0,30}(credit|balance|fund)|(?:credit|balance|fund).{0,30}(insufficient|not enough|low)|not enough.{0,20}(credit|balance|fund)|low.{0,20}(credit|balance)/i.test(responseText);
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

  if (groups.includes('allMembers')) {
    const { data, error } = await admin.from('members')
      .select('first_name, middle_name, last_name, phone')
      .eq('membership_status', 'active')
      .not('phone', 'is', null);
    if (error) throw error;
    for (const member of data || []) {
      recipients.push({
        name: [member.first_name, member.middle_name, member.last_name].filter(Boolean).join(' '),
        phone: member.phone
      });
    }
  }

  if (groups.includes('recentMembers')) {
    const sinceDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { data, error } = await admin.from('members')
      .select('first_name, middle_name, last_name, phone')
      .eq('membership_status', 'active')
      .gte('date_joined', sinceDate)
      .not('phone', 'is', null);
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
    if (payload?.action === 'balance') {
      const apiToken = Deno.env.get('MOCEAN_API_KEY');
      if (!apiToken) return jsonResponse({ error: 'Mocean SMS is not configured on the server.' }, 503, origin);

      let accountResponse: Response;
      try {
        accountResponse = await fetch('https://rest.moceanapi.com/rest/2/account/balance', {
          headers: { Authorization: apiToken },
          signal: AbortSignal.timeout(12000)
        });
      } catch {
        return jsonResponse({ error: 'Mocean account balance is temporarily unavailable.' }, 502, origin);
      }

      let accountData: Record<string, unknown> | null;
      try {
        const responseBody: unknown = await accountResponse.json();
        accountData = responseBody && typeof responseBody === 'object' && !Array.isArray(responseBody)
          ? responseBody as Record<string, unknown>
          : null;
      } catch {
        accountData = null;
      }
      const rawBalance = accountData?.value;
      const balance = typeof rawBalance === 'number'
        || (typeof rawBalance === 'string' && rawBalance.trim() !== '')
        ? Number(rawBalance)
        : Number.NaN;
      const status = Number(accountData?.status);
      const unit = typeof accountData?.unit === 'string' ? accountData.unit.trim() : '';
      if (!accountResponse.ok || status !== 0 || !Number.isFinite(balance) || balance < 0 || !unit) {
        return jsonResponse({ error: 'Mocean did not return a valid account balance.' }, 502, origin);
      }

      return jsonResponse({
        balance,
        unit
      }, 200, origin);
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
    if (recipients.length > 1000) return jsonResponse({ error: 'A message can include at most 1,000 recipients.' }, 400, origin);

    const apiKey = Deno.env.get('SEMAPHORE_API_KEY');
    const senderName = Deno.env.get('SEMAPHORE_SENDER_NAME')?.trim() || 'AMCOMS';
    if (!apiKey) return jsonResponse({ error: 'Semaphore SMS is not configured on the server.' }, 503, origin);

    const { data: logRows, error: logError } = await admin.from('sms_logs').insert(recipients.map((recipient) => ({
      recipient_name: recipient.name || null,
      phone_number: recipient.phone,
      message,
      notification_type: payload.action === 'send-group' ? 'announcement' : 'manual',
      status: 'pending',
      provider: 'semaphore'
    }))).select('id, phone_number');
    if (logError || !logRows?.length) {
      console.error('Unable to create SMS audit rows.');
      return jsonResponse({ error: 'SMS could not be recorded, so it was not sent.' }, 500, origin);
    }

    let providerResponse: Response;
    try {
      const form = new URLSearchParams({
        apikey: apiKey,
        number: recipients.map((recipient) => recipient.phone).join(','),
        message,
        sendername: senderName
      });
      providerResponse = await fetch('https://api.semaphore.co/api/v4/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form,
        signal: AbortSignal.timeout(20000)
      });
    } catch {
      await admin.from('sms_logs').update({
        status: 'failed',
        provider_response: { error: 'Semaphore request failed before a response was received.' }
      }).in('id', logRows.map((row) => row.id));
      return jsonResponse({ error: 'Semaphore could not be reached. The message was not confirmed as sent.' }, 502, origin);
    }

    let providerBody: unknown;
    try {
      providerBody = await providerResponse.json();
    } catch {
      providerBody = null;
    }

    if (!providerResponse.ok || !Array.isArray(providerBody)) {
      const insufficientCredits = providerResponse.status === 402 || hasInsufficientCreditError(providerBody);
      await admin.from('sms_logs').update({
        status: 'failed',
        provider_response: {
          http_status: providerResponse.status,
          error: insufficientCredits ? 'insufficient_sms_credits' : 'provider_rejected'
        }
      }).in('id', logRows.map((row) => row.id));
      return jsonResponse({
        error: insufficientCredits
          ? 'SMS credit is not enough. Please top up your Semaphore account and try again.'
          : 'Semaphore rejected the SMS request. Check the server configuration and logs.'
      }, insufficientCredits ? 402 : 502, origin);
    }

    const failedNumbers = new Set<string>();
    for (const result of providerBody) {
      const normalized = normalizePhone(String(result?.recipient || ''));
      if (normalized && /fail|error|invalid/i.test(String(result?.status || ''))) failedNumbers.add(normalized);
    }
    const acceptedLogIds = logRows.filter((row) => !failedNumbers.has(row.phone_number)).map((row) => row.id);
    const failedLogIds = logRows.filter((row) => failedNumbers.has(row.phone_number)).map((row) => row.id);
    const providerMetadata = providerBody.map((result) => ({
      message_id: result?.message_id ?? null,
      status: result?.status ?? null,
      network: result?.network ?? null
    }));

    if (acceptedLogIds.length) {
      const { error } = await admin.from('sms_logs').update({
        status: 'sent',
        provider_response: { http_status: providerResponse.status, messages: providerMetadata }
      }).in('id', acceptedLogIds);
      if (error) console.error('Unable to update successful SMS log status.');
    }
    if (failedLogIds.length) {
      const { error } = await admin.from('sms_logs').update({
        status: 'failed',
        provider_response: { http_status: providerResponse.status, messages: providerMetadata }
      }).in('id', failedLogIds);
      if (error) console.error('Unable to update failed SMS log status.');
    }

    if (acceptedLogIds.length === 0 && failedLogIds.length > 0 && hasInsufficientCreditError(providerBody)) {
      return jsonResponse({
        error: 'SMS credit is not enough. Please top up your Semaphore account and try again.'
      }, 402, origin);
    }

    return jsonResponse({
      sent_count: acceptedLogIds.length,
      failed_count: failedLogIds.length
    }, 200, origin);
  } catch (error) {
    console.error('Semaphore SMS action failed.');
    return jsonResponse({ error: error instanceof Error ? error.message : 'The SMS request could not be completed.' }, 400, origin);
  }
});

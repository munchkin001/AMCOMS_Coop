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
  return digits;
};

const parseMoceanResponse = (rawResponse: string): Record<string, unknown> | null => {
  try {
    const parsed: unknown = JSON.parse(rawResponse);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Mocean may return XML unless JSON is explicitly requested.
  }

  const getTag = (source: string, tag: string) => {
    const match = source.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'));
    return match?.[1]?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .trim();
  };
  const messages = Array.from(rawResponse.matchAll(/<message(?:\s[^>]*)?>([\s\S]*?)<\/message>/gi))
    .map(([, message]) => ({
      status: getTag(message, 'status'),
      receiver: getTag(message, 'receiver'),
      msgid: getTag(message, 'msgid'),
      err_msg: getTag(message, 'err_msg')
    }));

  if (!/<(?:xml|result|response|account|messages)\b/i.test(rawResponse)) return null;
  return {
    status: getTag(rawResponse, 'status'),
    value: getTag(rawResponse, 'value'),
    unit: getTag(rawResponse, 'unit'),
    err_msg: getTag(rawResponse, 'err_msg'),
    messages
  };
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
    const apiToken = Deno.env.get('MOCEAN_API_KEY');
    if (!apiToken) return jsonResponse({ error: 'Mocean SMS is not configured on the server.' }, 503, origin);

    if (payload?.action === 'balance') {
      let response: Response;
      try {
        response = await fetch('https://rest.moceanapi.com/rest/2/account/balance', {
          headers: { Authorization: apiToken },
          signal: AbortSignal.timeout(12000)
        });
      } catch {
        return jsonResponse({ error: 'Mocean account balance is temporarily unavailable.' }, 502, origin);
      }

      const account = parseMoceanResponse(await response.text().catch(() => ''));
      const balance = Number(account?.value);
      const unit = typeof account?.unit === 'string' ? account.unit.trim() : '';
      if (!response.ok || Number(account?.status) !== 0 || !Number.isFinite(balance) || balance < 0 || !unit) {
        return jsonResponse({
          error: typeof account?.err_msg === 'string' && account.err_msg
            ? `Mocean balance lookup failed: ${account.err_msg}`
            : 'Mocean did not return a valid account balance.'
        }, 502, origin);
      }
      return jsonResponse({ balance, unit }, 200, origin);
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
    if (recipients.length > 500) return jsonResponse({ error: 'Mocean supports at most 500 recipients per request.' }, 400, origin);

    const senderName = Deno.env.get('MOCEAN_SENDER_NAME')?.trim() || 'AMCOMS';
    const { data: logRows, error: logError } = await admin.from('sms_logs').insert(recipients.map((recipient) => ({
      recipient_name: recipient.name || null,
      phone_number: recipient.phone,
      message,
      notification_type: payload.action === 'send-group' ? 'announcement' : 'manual',
      status: 'pending',
      provider: 'mocean'
    }))).select('id, phone_number');
    if (logError || !logRows?.length) {
      console.error('Unable to create SMS audit rows.');
      return jsonResponse({ error: 'SMS could not be recorded, so it was not sent.' }, 500, origin);
    }

    let providerResponse: Response;
    try {
      providerResponse = await fetch('https://rest.moceanapi.com/rest/2/sms', {
        method: 'POST',
        headers: {
          Authorization: apiToken,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          'mocean-from': senderName,
          'mocean-to': recipients.map((recipient) => recipient.phone).join(','),
          'mocean-text': message,
          'mocean-resp-format': 'json'
        }),
        signal: AbortSignal.timeout(20000)
      });
    } catch {
      await admin.from('sms_logs').update({
        status: 'failed',
        provider_response: { error: 'Mocean request failed before a response was received.' }
      }).in('id', logRows.map((row) => row.id));
      return jsonResponse({ error: 'Mocean could not be reached. The message was not confirmed as sent.' }, 502, origin);
    }

    const responseObject = parseMoceanResponse(await providerResponse.text().catch(() => ''));
    const results = Array.isArray(responseObject?.messages) ? responseObject.messages : [];
    if (providerResponse.status !== 202 || !results.length) {
      await admin.from('sms_logs').update({
        status: 'failed',
        provider_response: {
          http_status: providerResponse.status,
          error: responseObject?.messages || responseObject?.err_msg || 'provider_rejected'
        }
      }).in('id', logRows.map((row) => row.id));
      const firstResult = results[0] as Record<string, unknown> | undefined;
      return jsonResponse({
        error: typeof firstResult?.err_msg === 'string'
          ? `Mocean rejected the SMS request: ${firstResult.err_msg}`
          : 'Mocean rejected the SMS request. Check the Mocean API token and sender configuration.'
      }, 502, origin);
    }

    const acceptedNumbers = new Set<string>();
    const failedNumbers = new Set<string>();
    for (const rawResult of results) {
      if (!rawResult || typeof rawResult !== 'object') continue;
      const result = rawResult as Record<string, unknown>;
      const phone = normalizePhone(String(result.receiver || ''));
      if (!phone) continue;
      if (Number(result.status) === 0) acceptedNumbers.add(phone);
      else failedNumbers.add(phone);
    }
    const acceptedLogIds = logRows.filter((row) => acceptedNumbers.has(row.phone_number)).map((row) => row.id);
    const failedLogIds = logRows.filter((row) => !acceptedNumbers.has(row.phone_number)).map((row) => row.id);
    const providerMetadata = results.map((rawResult) => {
      const result = rawResult as Record<string, unknown>;
      return { message_id: result.msgid ?? null, status: result.status ?? null, error: result.err_msg ?? null };
    });

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

    return jsonResponse({
      sent_count: acceptedLogIds.length,
      failed_count: failedLogIds.length
    }, 200, origin);
  } catch (error) {
    console.error('Mocean SMS action failed.');
    return jsonResponse({ error: error instanceof Error ? error.message : 'The SMS request could not be completed.' }, 400, origin);
  }
});

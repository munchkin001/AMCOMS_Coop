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

const parseResponse = async (response: Response): Promise<Record<string, unknown> | null> => {
  try {
    const body = await response.json();
    return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
};

const isValidSender = (value: string) => /^\d{1,15}$/.test(value) || /^[a-zA-Z0-9]{1,11}$/.test(value);

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
      const apiKey = Deno.env.get('BREVO_API_KEY');
      if (!apiKey) return jsonResponse({ error: 'Brevo SMS is not configured on the server.' }, 503, origin);

      let accountResponse: Response;
      try {
        accountResponse = await fetch('https://api.brevo.com/v3/account', {
          headers: { 'api-key': apiKey, accept: 'application/json' },
          signal: AbortSignal.timeout(12000)
        });
      } catch {
        return jsonResponse({ error: 'Brevo account balance is temporarily unavailable.' }, 502, origin);
      }

      const account = await parseResponse(accountResponse);
      const smsPlan = Array.isArray(account?.plan)
        ? account.plan.find((plan: Record<string, unknown>) => plan?.type === 'sms')
        : null;
      const creditBalance = Number(smsPlan?.credits);
      if (!accountResponse.ok || !Number.isFinite(creditBalance)) {
        return jsonResponse({
          error: 'Brevo did not return SMS credits. Check that transactional SMS is enabled for your account.'
        }, 502, origin);
      }

      return jsonResponse({
        account_name: typeof account?.companyName === 'string' ? account.companyName : 'Brevo',
        credit_balance: creditBalance
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

    const apiKey = Deno.env.get('BREVO_API_KEY');
    const senderName = Deno.env.get('BREVO_SMS_SENDER')?.trim() || '';
    if (!apiKey || !senderName) {
      return jsonResponse({ error: 'Configure BREVO_API_KEY and BREVO_SMS_SENDER in Supabase function secrets.' }, 503, origin);
    }
    if (!isValidSender(senderName)) {
      return jsonResponse({ error: 'Brevo sender must be an approved name up to 11 letters/numbers or a number up to 15 digits.' }, 503, origin);
    }

    const { data: logRows, error: logError } = await admin.from('sms_logs').insert(recipients.map((recipient) => ({
      recipient_name: recipient.name || null,
      phone_number: recipient.phone,
      message,
      notification_type: payload.action === 'send-group' ? 'announcement' : 'manual',
      status: 'pending',
      provider: 'brevo'
    }))).select('id, phone_number');
    if (logError || !logRows?.length) {
      console.error('Unable to create SMS audit rows.');
      return jsonResponse({ error: 'SMS could not be recorded, so it was not sent.' }, 500, origin);
    }

    const outcomes: Array<{ ok: boolean; logId: string; httpStatus?: number; messageId?: unknown; error?: string }> =
      new Array(logRows.length);
    let nextIndex = 0;
    const workerCount = Math.min(5, logRows.length);
    await Promise.all(Array.from({ length: workerCount }, async () => {
      while (nextIndex < logRows.length) {
        const index = nextIndex++;
        const logRow = logRows[index];
        const recipient = recipients.find((candidate) => candidate.phone === logRow.phone_number);
        if (!recipient) {
          outcomes[index] = { ok: false, logId: logRow.id, error: 'Unable to match the SMS audit record to its recipient.' };
          continue;
        }
        try {
          const providerResponse = await fetch('https://api.brevo.com/v3/transactionalSMS/send', {
            method: 'POST',
            headers: {
              'api-key': apiKey,
              accept: 'application/json',
              'content-type': 'application/json'
            },
            body: JSON.stringify({
              sender: senderName,
              recipient: recipient.phone,
              content: message,
              type: 'transactional',
              tag: payload.action === 'send-group' ? 'amcoms_announcement' : 'amcoms_manual'
            }),
            signal: AbortSignal.timeout(20000)
          });
          const providerBody = await parseResponse(providerResponse);
          outcomes[index] = {
            ok: providerResponse.ok,
            logId: logRow.id,
            httpStatus: providerResponse.status,
            messageId: providerBody?.messageId,
            error: providerResponse.ok
              ? undefined
              : String(providerBody?.message || providerBody?.code || 'Brevo rejected the SMS request.')
          };
        } catch {
          outcomes[index] = {
            ok: false,
            logId: logRow.id,
            error: 'Brevo request failed before a response was received.'
          };
        }
      }
    }));

    for (const ok of [true, false]) {
      const matchingOutcomes = outcomes.filter((outcome) => outcome.ok === ok);
      if (!matchingOutcomes.length) continue;
      const { error } = await admin.from('sms_logs').update({
        status: ok ? 'sent' : 'failed',
        provider_response: {
          provider: 'brevo',
          messages: matchingOutcomes.map(({ logId, httpStatus, messageId, error: providerError }) => ({
            log_id: logId,
            http_status: httpStatus ?? null,
            message_id: messageId ?? null,
            error: providerError ?? null
          }))
        }
      }).in('id', matchingOutcomes.map((outcome) => outcome.logId));
      if (error) console.error(`Unable to update ${ok ? 'successful' : 'failed'} Brevo SMS log status.`);
    }

    const sentCount = outcomes.filter((outcome) => outcome.ok).length;
    return jsonResponse({
      sent_count: sentCount,
      failed_count: outcomes.length - sentCount
    }, 200, origin);
  } catch (error) {
    console.error('Brevo SMS action failed.');
    return jsonResponse({ error: error instanceof Error ? error.message : 'The SMS request could not be completed.' }, 400, origin);
  }
});

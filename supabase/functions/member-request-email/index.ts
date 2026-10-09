import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin'
};

const json = (body: Record<string, unknown>, status: number, origin: string) => new Response(
  JSON.stringify(body),
  { status, headers: { ...corsHeaders, 'Access-Control-Allow-Origin': origin, 'Content-Type': 'application/json' } }
);

const isLocalDevOrigin = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' && url.port === '5173'
      && (['localhost', '127.0.0.1'].includes(url.hostname)
        || /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname));
  } catch {
    return false;
  }
};

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

Deno.serve(async (request) => {
  const origin = request.headers.get('origin') || '';
  const configuredAppUrl = Deno.env.get('APP_URL')?.replace(/\/$/, '');
  if (origin !== configuredAppUrl && !isLocalDevOrigin(origin)) {
    return new Response('Origin is not allowed.', { status: 403 });
  }
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: { ...corsHeaders, 'Access-Control-Allow-Origin': origin } });
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, origin);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const smtpHost = Deno.env.get('SMTP_HOST') || 'smtp.gmail.com';
  const smtpPort = Number(Deno.env.get('SMTP_PORT') || 465);
  const smtpUser = Deno.env.get('SMTP_USER');
  const smtpPass = Deno.env.get('SMTP_PASS');
  const fromName = Deno.env.get('SMTP_FROM_NAME') || 'AMCOMS';
  if (!supabaseUrl || !anonKey || !serviceKey || !smtpUser || !smtpPass) {
    return json({ error: 'Email service is not configured.' }, 500, origin);
  }
  const from = `${fromName} <${smtpUser}>`;

  const authHeader = request.headers.get('Authorization') || '';
  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userError } = await caller.auth.getUser();
  if (userError || !userData.user) return json({ error: 'Not signed in.' }, 401, origin);

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: staff } = await admin
    .from('staff').select('role').eq('user_id', userData.user.id).maybeSingle();
  if (staff?.role !== 'bookkeeper') return json({ error: 'Only the Bookkeeper can send this email.' }, 403, origin);

  let applicationId = '';
  let requestId = '';
  try {
    const body = await request.json();
    applicationId = String(body.application_id || '');
    requestId = String(body.request_id || '');
  } catch {
    return json({ error: 'Invalid request.' }, 400, origin);
  }
  if (!applicationId && !requestId) return json({ error: 'Invalid request.' }, 400, origin);

  let recipient = '';
  let firstName = '';
  let status = '';
  let reason = '';
  let subjectLabel = 'membership application';
  let approvedText = 'Your membership application with the Agay-ayan Multi-Purpose Cooperative has been approved.';
  let rejectedText = 'Thank you for your interest in the Agay-ayan Multi-Purpose Cooperative. Your membership application was not approved at this time.';
  let approvedExtra = 'You can now sign in to the Member Portal using the email and password you registered with.';

  if (applicationId) {
    const { data: application, error: appError } = await admin
      .from('member_applications')
      .select('first_name, email, status, review_notes, rejection_reason')
      .eq('id', applicationId)
      .maybeSingle();
    if (appError || !application) return json({ error: 'Request not found.' }, 404, origin);
    recipient = application.email;
    firstName = application.first_name;
    status = application.status;
    reason = application.review_notes || application.rejection_reason || '';
  } else {
    const { data: record, error: recordError } = await admin
      .from('requests')
      .select('request_number, request_type, request_data, amount, status, review_notes, member:members(first_name, email)')
      .eq('id', requestId)
      .maybeSingle();
    if (recordError || !record) return json({ error: 'Request not found.' }, 404, origin);
    const member = Array.isArray(record.member) ? record.member[0] : record.member;
    if (!member?.email) return json({ error: 'The member has no email address on file.' }, 422, origin);
    const label = String(record.request_data?.type || record.request_type || 'request')
      .replace(/_/g, ' ').toLowerCase();
    const amount = Number(record.amount) > 0
      ? ` of ₱${Number(record.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
      : '';
    recipient = member.email;
    firstName = member.first_name;
    status = record.status;
    reason = record.review_notes || '';
    subjectLabel = `${label} request`;
    approvedText = `Your ${label} request${amount} (${record.request_number}) has been approved.`;
    rejectedText = `Your ${label} request${amount} (${record.request_number}) was not approved at this time.`;
    approvedExtra = 'You can view the details in your Member Portal.';
  }

  if (!['approved', 'rejected'].includes(status)) {
    return json({ error: 'This request has not been decided yet.' }, 409, origin);
  }

  const approved = status === 'approved';
  const subject = approved
    ? `Your ${subjectLabel} has been approved`
    : `Update on your ${subjectLabel}`;
  const name = escapeHtml(firstName || 'Member');
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#1f2937">
      <h2 style="color:${approved ? '#047857' : '#b91c1c'}">${approved ? 'Request approved' : 'Request update'}</h2>
      <p>Hello ${name},</p>
      <p>${escapeHtml(approved ? approvedText : rejectedText)}</p>
      ${reason ? `<p style="background:#f3f4f6;padding:12px;border-radius:8px">${escapeHtml(reason)}</p>` : ''}
      ${approved ? `<p>${escapeHtml(approvedExtra)}</p>` : ''}
      <p style="color:#6b7280;font-size:12px">Agay-ayan Multi-Purpose Cooperative</p>
    </div>`;

  const smtp = new SMTPClient({
    connection: {
      hostname: smtpHost,
      port: smtpPort,
      tls: smtpPort === 465,
      auth: { username: smtpUser, password: smtpPass }
    }
  });
  try {
    const text = [
      `Hello ${firstName || 'Member'},`,
      '',
      approved ? approvedText : rejectedText,
      reason ? `\n${reason}` : '',
      approved ? `\n${approvedExtra}` : '',
      '\nAMCOMS - Agay-ayan Multi-Purpose Cooperative'
    ].join('\n');
    await smtp.send({ from, to: recipient, subject, content: 'auto', mimeContent: [
      { mimeType: 'text/plain; charset="utf-8"', content: text, transferEncoding: 'base64' },
      { mimeType: 'text/html; charset="utf-8"', content: html.replace(/>\s+</g, '><').trim(), transferEncoding: 'base64' }
    ] });
  } catch (error) {
    console.error('SMTP error', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'The email could not be sent.' }, 502, origin);
  } finally {
    await smtp.close().catch(() => undefined);
  }
  return json({ sent: true }, 200, origin);
});

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const REMINDER_DAYS = [7, 3, 1];

const normalizePhone = (value: string) => {
  let digits = (value || '').replace(/[\s()-]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (digits.startsWith('09') && digits.length === 11) digits = `63${digits.slice(1)}`;
  return /^639\d{9}$/.test(digits) ? digits : null;
};

const manilaDate = (offsetDays: number) => {
  const now = new Date(Date.now() + 8 * 3600 * 1000 + offsetDays * 86400000);
  return now.toISOString().slice(0, 10);
};

const peso = (n: number) => `PHP ${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const safeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

Deno.serve(async (request) => {
  const secret = Deno.env.get('CRON_SECRET') || '';
  const provided = request.headers.get('x-cron-secret') || '';
  if (request.method !== 'POST' || !secret || !safeEqual(secret, provided)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const apiToken = Deno.env.get('MOCEAN_API_KEY');
  const senderName = Deno.env.get('MOCEAN_SENDER_NAME') || 'AMCOMS';
  if (!apiToken) return new Response(JSON.stringify({ error: 'Mocean SMS not configured' }), { status: 503 });

  const { data: penalties } = await admin.rpc('apply_loan_penalties');

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const days of REMINDER_DAYS) {
    const type = `loan_due_${days}d`;
    const { data: rows, error } = await admin
      .from('loan_schedule')
      .select('id, due_date, amount_due, amount_paid, loans!inner(loan_number, status, members!inner(first_name, phone))')
      .eq('due_date', manilaDate(days))
      .neq('status', 'paid')
      .eq('loans.status', 'active');
    if (error) {
      console.error('Unable to load schedule rows', error.message);
      continue;
    }

    for (const row of rows || []) {
      const loan = row.loans as any;
      const member = loan?.members;
      const phone = normalizePhone(member?.phone || '');
      if (!phone) {
        skipped++;
        continue;
      }

      const { data: existing } = await admin
        .from('sms_logs').select('id').eq('related_table', 'loan_schedule').eq('related_id', row.id)
        .eq('notification_type', type).in('status', ['sent', 'pending']).limit(1);
      if (existing?.length) continue;

      const due = new Date(`${row.due_date}T00:00:00Z`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
      const when = days === 1 ? 'tomorrow' : `in ${days} days`;
      const message = `AMCOMS: Hi ${member.first_name}, your loan payment of ${peso(row.amount_due - row.amount_paid)} (${loan.loan_number}) is due ${when}, ${due}. Please pay on time to avoid a late charge. Thank you!`;

      const { data: log } = await admin.from('sms_logs').insert({
        recipient_name: member.first_name,
        phone_number: phone,
        message,
        notification_type: type,
        status: 'pending',
        provider: 'mocean',
        related_table: 'loan_schedule',
        related_id: row.id
      }).select('id').single();
      if (!log) continue;

      try {
        const res = await fetch('https://rest.moceanapi.com/rest/2/sms', {
          method: 'POST',
          headers: {
            Authorization: apiToken,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams({
            'mocean-from': senderName,
            'mocean-to': phone,
            'mocean-text': message
          }),
          signal: AbortSignal.timeout(20000)
        });
        const body: unknown = await res.json().catch(() => null);
        const responseBody = body && typeof body === 'object' && !Array.isArray(body)
          ? body as Record<string, unknown>
          : null;
        const messages = Array.isArray(responseBody?.messages) ? responseBody.messages : [];
        const result = messages[0] && typeof messages[0] === 'object'
          ? messages[0] as Record<string, unknown>
          : null;
        const ok = res.status === 202 && Number(result?.status) === 0;
        await admin.from('sms_logs').update({
          status: ok ? 'sent' : 'failed',
          provider_response: {
            http_status: res.status,
            message_id: result?.msgid ?? null,
            error: result?.err_msg ?? null
          }
        }).eq('id', log.id);
        if (ok) sent++;
        else failed++;
      } catch {
        await admin.from('sms_logs').update({ status: 'failed', provider_response: { error: 'request failed' } }).eq('id', log.id);
        failed++;
      }
    }
  }

  return new Response(JSON.stringify({ penalties_applied: penalties ?? 0, sent, failed, skipped_no_phone: skipped }), {
    headers: { 'Content-Type': 'application/json' }
  });
});

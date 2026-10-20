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
  const apiKey = Deno.env.get('BREVO_API_KEY');
  const senderName = Deno.env.get('BREVO_SMS_SENDER')?.trim() || '';
  if (!apiKey || !senderName) {
    return new Response(JSON.stringify({ error: 'Brevo SMS is not configured' }), { status: 503 });
  }
  if (!(/^\d{1,15}$/.test(senderName) || /^[a-zA-Z0-9]{1,11}$/.test(senderName))) {
    return new Response(JSON.stringify({ error: 'Brevo SMS sender is invalid' }), { status: 503 });
  }

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
        provider: 'brevo',
        related_table: 'loan_schedule',
        related_id: row.id
      }).select('id').single();
      if (!log) continue;

      try {
        const res = await fetch('https://api.brevo.com/v3/transactionalSMS/send', {
          method: 'POST',
          headers: {
            'api-key': apiKey,
            accept: 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            sender: senderName,
            recipient: phone,
            content: message,
            type: 'transactional',
            tag: 'amcoms_loan_due_reminder'
          }),
          signal: AbortSignal.timeout(20000)
        });
        const body = await res.json().catch(() => null);
        const ok = res.ok && body?.messageId != null;
        await admin.from('sms_logs').update({
          status: ok ? 'sent' : 'failed',
          provider_response: {
            provider: 'brevo',
            http_status: res.status,
            message_id: body?.messageId ?? null,
            error: ok ? null : body?.message ?? body?.code ?? null
          }
        }).eq('id', log.id);
        ok ? sent++ : failed++;
      } catch {
        await admin.from('sms_logs').update({
          status: 'failed',
          provider_response: { provider: 'brevo', error: 'request failed' }
        }).eq('id', log.id);
        failed++;
      }
    }
  }

  return new Response(JSON.stringify({ penalties_applied: penalties ?? 0, sent, failed, skipped_no_phone: skipped }), {
    headers: { 'Content-Type': 'application/json' }
  });
});

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

// Creates the applicant's login without sending a confirmation email.
// Staff approval is the verification step for new members.
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

  let email = '';
  let password = '';
  let metadata: Record<string, string> = {};
  try {
    const body = await request.json();
    email = String(body.email || '').trim().toLowerCase();
    password = String(body.password || '');
    metadata = {
      first_name: String(body.first_name || '').slice(0, 100),
      last_name: String(body.last_name || '').slice(0, 100),
      phone: String(body.phone || '').slice(0, 30)
    };
  } catch {
    return json({ error: 'Invalid request.' }, 400, origin);
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return json({ error: 'Enter a valid email address.' }, 400, origin);
  }
  if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    return json({ error: 'Use at least 8 characters with an uppercase letter, a lowercase letter, and a number.' }, 400, origin);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return json({ error: 'Service is not configured.' }, 500, origin);

  const admin = createClient(supabaseUrl, serviceKey);
  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: metadata
  });
  if (error) {
    const exists = /already|registered|exists/i.test(error.message);
    return json({ error: exists ? 'An account with this email already exists.' : 'The account could not be created.' }, exists ? 409 : 400, origin);
  }
  return json({ created: true }, 200, origin);
});

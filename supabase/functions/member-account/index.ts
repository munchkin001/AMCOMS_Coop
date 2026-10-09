import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin'
};

const jsonResponse = (body: Record<string, unknown>, status: number, origin: string) => new Response(
  JSON.stringify(body),
  { status, headers: { ...corsHeaders, 'Access-Control-Allow-Origin': origin, 'Content-Type': 'application/json' } }
);

const passwordProblem = (password: string) => {
  if (password.length < 8) return 'Use a password with at least 8 characters.';
  if (!/[A-Z]/.test(password)) return 'Include at least one uppercase letter.';
  if (!/[a-z]/.test(password)) return 'Include at least one lowercase letter.';
  if (!/[0-9]/.test(password)) return 'Include at least one number.';
  return null;
};

const isLocalDevOrigin = (value: string) => {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' || url.port !== '5173') return false;
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

const resolveAppUrl = (requestedUrl: string, requestOrigin: string, configuredUrl?: string) => {
  const normalizedUrl = requestedUrl.replace(/\/$/, '');
  const resolvedOrigin = new URL(normalizedUrl).origin;
  if (resolvedOrigin !== requestOrigin && resolvedOrigin !== configuredUrl && !isLocalDevOrigin(resolvedOrigin)) {
    throw new Error('The configured app URL is not allowed for authentication redirects.');
  }
  return normalizedUrl;
};

const findAuthUserByEmail = async (admin: ReturnType<typeof createClient>, email: string) => {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const match = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (match) return match;
    if (data.users.length < 1000) break;
  }
  return null;
};

const recordAccountEvent = async (
  admin: ReturnType<typeof createClient>,
  staffId: string,
  memberId: string,
  action: string
) => {
  const { error } = await admin.from('audit_logs').insert({
    user_id: staffId,
    action,
    table_name: 'member_authentication',
    record_id: memberId,
    new_data: { event: action }
  });
  if (error) console.error('Member account event could not be recorded.');
};

Deno.serve(async (request) => {
  const origin = request.headers.get('origin') || '';
  const configuredAppUrl = Deno.env.get('APP_URL')?.replace(/\/$/, '');
  const allowedOrigins = new Set([
    configuredAppUrl,
    'http://localhost:5173',
    'http://127.0.0.1:5173'
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
    return jsonResponse({ error: 'Account service is not configured.' }, 500, origin);
  }

  const authorization = request.headers.get('Authorization');
  if (!authorization) return jsonResponse({ error: 'Authentication is required.' }, 401, origin);

  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const publicAuth = createClient(supabaseUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });

  try {
    const { data: authData, error: authError } = await caller.auth.getUser();
    if (authError || !authData.user) return jsonResponse({ error: 'Authentication is required.' }, 401, origin);

    const { data: actor, error: actorError } = await caller
      .from('staff')
      .select('id, role, is_active, member_id, must_change_password')
      .eq('user_id', authData.user.id)
      .maybeSingle();
    if (actorError || !actor?.is_active) return jsonResponse({ error: 'An active account is required.' }, 403, origin);

    const payload = await request.json();
    const action = payload?.action;

    if (action === 'complete-password-setup') {
      if (actor.role !== 'member' || !actor.member_id || !actor.must_change_password) {
        return jsonResponse({ error: 'No member password setup is pending.' }, 403, origin);
      }
      const { data: member, error: memberError } = await caller
        .from('members')
        .select('email, membership_status, archived_at')
        .eq('id', actor.member_id)
        .maybeSingle();
      if (memberError) throw memberError;
      if (!member || member.membership_status !== 'active' || member.archived_at) {
        return jsonResponse({ error: 'An active membership is required.' }, 403, origin);
      }

      const password = String(payload?.password || '');
      const validationMessage = passwordProblem(password);
      if (validationMessage) return jsonResponse({ error: validationMessage }, 400, origin);
      if (member.email && password.toLowerCase() === member.email.toLowerCase()) {
        return jsonResponse({ error: 'Choose a password different from your email.' }, 400, origin);
      }

      const { error: passwordError } = await admin.auth.admin.updateUserById(authData.user.id, { password });
      if (passwordError) throw passwordError;
      const { error: flagError } = await admin.from('staff')
        .update({ must_change_password: false })
        .eq('id', actor.id)
        .eq('user_id', authData.user.id);
      if (flagError) throw flagError;
      await recordAccountEvent(admin, actor.id, actor.member_id, 'MEMBER_ACCOUNT_ACTIVATED');
      return jsonResponse({ completed: true }, 200, origin);
    }

    if (!['bookkeeper', 'chairman'].includes(actor.role)) {
      return jsonResponse({ error: 'Only Bookkeepers and the Chairman can manage member accounts.' }, 403, origin);
    }
    const memberId = String(payload?.member_id || '');
    if (!memberId) return jsonResponse({ error: 'A member record is required.' }, 400, origin);

    const { data: member, error: memberError } = await admin.from('members')
      .select('id, member_number, email, membership_status, archived_at')
      .eq('id', memberId)
      .maybeSingle();
    if (memberError) throw memberError;
    if (!member) return jsonResponse({ error: 'Member record not found.' }, 404, origin);

    if (action === 'reactivate-member') {
      if (actor.role !== 'bookkeeper') return jsonResponse({ error: 'Only Bookkeepers can reactivate archived members.' }, 403, origin);
      const { data: restoredMember, error: restoreError } = await caller.rpc('bookkeeper_reactivate_member', {
        p_member_id: member.id
      });
      if (restoreError) throw restoreError;

      const { data: linkedAccount, error: linkedAccountError } = await admin.from('staff')
        .select('id, user_id, is_active')
        .eq('member_id', member.id)
        .eq('role', 'member')
        .maybeSingle();
      if (linkedAccountError) throw linkedAccountError;

      if (linkedAccount?.user_id) {
        const { error: unbanError } = await admin.auth.admin.updateUserById(linkedAccount.user_id, { ban_duration: 'none' });
        if (unbanError) throw unbanError;
        if (!linkedAccount.is_active) {
          const { error: activateError } = await admin.from('staff')
            .update({ is_active: true })
            .eq('id', linkedAccount.id)
            .eq('role', 'member');
          if (activateError) throw activateError;
        }
        await recordAccountEvent(admin, actor.id, member.id, 'MEMBER_PORTAL_ACCESS_RESTORED');
      }

      return jsonResponse({
        reactivated: true,
        portal_access_restored: Boolean(linkedAccount?.user_id),
        member_number: restoredMember?.member_number || member.member_number
      }, 200, origin);
    }

    if (action === 'disable-account') {
      if (actor.role !== 'bookkeeper') return jsonResponse({ error: 'Only Bookkeepers can disable archived member accounts.' }, 403, origin);
      if (member.membership_status !== 'inactive' && !member.archived_at) {
        return jsonResponse({ error: 'Only archived member accounts can be disabled.' }, 409, origin);
      }
      const { data: archivedStaff, error: archivedStaffError } = await admin.from('staff')
        .select('id, user_id')
        .eq('member_id', member.id)
        .eq('role', 'member')
        .maybeSingle();
      if (archivedStaffError) throw archivedStaffError;
      if (archivedStaff?.user_id) {
        const { error: banError } = await admin.auth.admin.updateUserById(archivedStaff.user_id, { ban_duration: '876000h' });
        if (banError) throw banError;
      }
      return jsonResponse({ disabled: true }, 200, origin);
    }

    if (member.membership_status !== 'active' || member.archived_at) {
      return jsonResponse({ error: 'Portal access is unavailable for archived members.' }, 409, origin);
    }

    const email = member.email?.trim().toLowerCase();
    if (!email) return jsonResponse({ error: 'A registered email is required for Member Portal access.' }, 400, origin);
    const requestedAppUrl = String(payload?.app_url || configuredAppUrl || origin);
    const appUrl = resolveAppUrl(requestedAppUrl, origin, configuredAppUrl);
    const redirectTo = `${appUrl}/reset-password`;
    const { data: linkedStaff, error: linkedError } = await admin.from('staff')
      .select('id, user_id, role, must_change_password')
      .eq('member_id', member.id)
      .maybeSingle();
    if (linkedError) throw linkedError;

    const { data: staffByEmail, error: staffEmailError } = await admin.from('staff')
      .select('id, user_id, role, member_id')
      .ilike('email', email)
      .maybeSingle();
    if (staffEmailError) throw staffEmailError;
    if (staffByEmail && (staffByEmail.role !== 'member' || (staffByEmail.member_id && staffByEmail.member_id !== member.id))) {
      return jsonResponse({ error: 'This email is already associated with another account.' }, 409, origin);
    }

    const sendRecoveryLink = async (staffId: string, authUserId: string, eventName: string) => {
      const { data: authUserData, error: authUserError } = await admin.auth.admin.getUserById(authUserId);
      if (authUserError) throw authUserError;
      const authEmail = authUserData.user.email?.trim().toLowerCase() || '';
      if (authEmail !== email) return jsonResponse({ error: 'The member email differs from the verified login email.' }, 409, origin);

      const { error: flagError } = await admin.from('staff').update({ must_change_password: true }).eq('id', staffId);
      if (flagError) throw flagError;
      const { error: resetError } = await publicAuth.auth.resetPasswordForEmail(authEmail, { redirectTo });
      if (resetError) {
        await admin.from('staff').update({ must_change_password: linkedStaff?.must_change_password || false }).eq('id', staffId);
        throw resetError;
      }
      await recordAccountEvent(admin, actor.id, member.id, eventName);
      return jsonResponse({ sent: true, message: 'Secure instructions were sent to the registered email if delivery is available.' }, 200, origin);
    };

    if (action === 'reset' || action === 'resend-activation') {
      if (!linkedStaff?.user_id || linkedStaff.role !== 'member') {
        return jsonResponse({ error: 'No linked Member Portal account was found.' }, 404, origin);
      }
      if (action === 'resend-activation' && !linkedStaff.must_change_password) {
        return jsonResponse({ error: 'This account is already activated. Use password reset instead.' }, 409, origin);
      }
      return await sendRecoveryLink(
        linkedStaff.id,
        linkedStaff.user_id,
        action === 'reset' ? 'ADMIN_PASSWORD_RESET_INITIATED' : 'MEMBER_ACTIVATION_RESENT'
      );
    }

    if (actor.role !== 'bookkeeper') {
      return jsonResponse({ error: 'Only Bookkeepers can create member portal accounts.' }, 403, origin);
    }
    if (action !== 'invite') return jsonResponse({ error: 'Unsupported member account action.' }, 400, origin);
    if (linkedStaff?.user_id) {
      if (linkedStaff.role === 'member' && linkedStaff.must_change_password) {
        return await sendRecoveryLink(linkedStaff.id, linkedStaff.user_id, 'MEMBER_ACTIVATION_RESENT');
      }
      return jsonResponse({ error: 'This member already has an activated account.' }, 409, origin);
    }

    let authUser = staffByEmail?.user_id ? null : await findAuthUserByEmail(admin, email);
    let createdAuthUser = false;
    if (!authUser && !staffByEmail?.user_id) {
      const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo,
        data: { member_number: member.member_number }
      });
      if (inviteError) throw inviteError;
      authUser = inviteData.user;
      createdAuthUser = true;
    }

    const authUserId = staffByEmail?.user_id || authUser?.id;
    if (!authUserId) throw new Error('The authentication account could not be created.');
    const { error: linkError } = await caller.rpc('bookkeeper_link_member_auth', {
      p_member_id: member.id,
      p_auth_user_id: authUserId
    });
    if (linkError) {
      if (createdAuthUser) await admin.auth.admin.deleteUser(authUserId);
      throw linkError;
    }

    if (!createdAuthUser) {
      const { error: recoveryError } = await publicAuth.auth.resetPasswordForEmail(email, { redirectTo });
      if (recoveryError) throw recoveryError;
    }
    await recordAccountEvent(admin, actor.id, member.id, 'MEMBER_ACCOUNT_CREATED');
    await recordAccountEvent(admin, actor.id, member.id, 'MEMBER_ACTIVATION_SENT');
    return jsonResponse({ sent: true, message: 'Secure activation instructions were sent to the registered email if delivery is available.' }, 200, origin);
  } catch (error) {
    console.error('Member account action failed.');
    return jsonResponse({ error: error instanceof Error ? error.message : 'The member account action could not be completed.' }, 400, origin);
  }
});
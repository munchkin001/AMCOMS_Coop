import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const generateTempPassword = () => {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const all = upper + lower + digits;
  const pick = (set: string) => set[crypto.getRandomValues(new Uint32Array(1))[0] % set.length];
  const chars = [pick(upper), pick(lower), pick(digits)];
  while (chars.length < 12) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
};

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
    const port = Number(url.port);
    if (url.protocol !== 'http:' || port < 5173 || port > 5180) return false;
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
  const configuredAppOrigins = Deno.env.get('APP_ALLOWED_ORIGINS')
    ?.split(',')
    .map((configuredOrigin) => configuredOrigin.trim().replace(/\/$/, '')) || [];
  const allowedOrigins = new Set([
    configuredAppUrl,
    ...configuredAppOrigins,
    'https://amci-staff.vercel.app',
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
      if (!actor.must_change_password) {
        return jsonResponse({ error: 'No temporary password change is required.' }, 403, origin);
      }

      const password = String(payload?.password || '');
      const validationMessage = passwordProblem(password);
      if (validationMessage) return jsonResponse({ error: validationMessage }, 400, origin);

      if (actor.role === 'member') {
        if (!actor.member_id) return jsonResponse({ error: 'The member account is not linked.' }, 403, origin);
        const { data: member, error: memberError } = await caller
          .from('members')
          .select('membership_status, archived_at')
          .eq('id', actor.member_id)
          .maybeSingle();
        if (memberError) throw memberError;
        if (!member || member.membership_status !== 'active' || member.archived_at) {
          return jsonResponse({ error: 'An active membership is required.' }, 403, origin);
        }
      }

      const { error: passwordError } = await admin.auth.admin.updateUserById(authData.user.id, { password });
      if (passwordError) throw passwordError;
      const { error: flagError } = await admin.from('staff')
        .update({ must_change_password: false })
        .eq('id', actor.id)
        .eq('user_id', authData.user.id);
      if (flagError) throw flagError;
      await recordAccountEvent(
        admin,
        actor.id,
        actor.member_id || actor.id,
        actor.role === 'member' ? 'MEMBER_ACCOUNT_ACTIVATED' : 'STAFF_TEMPORARY_PASSWORD_CHANGED'
      );
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

    if (action === 'delete-account') {
      if (!['bookkeeper', 'chairman'].includes(actor.role)) {
        return jsonResponse({ error: 'Only Bookkeepers and the Chairman can delete member accounts.' }, 403, origin);
      }
      if (member.membership_status !== 'inactive' && !member.archived_at) {
        return jsonResponse({ error: 'Only archived members can have their portal accounts deleted.' }, 409, origin);
      }
      const { data: activeLoans, error: loansError } = await admin
        .from('loans')
        .select('id', { count: 'exact', head: true })
        .eq('member_id', member.id)
        .in('status', ['approved', 'active'])
        .gt('balance', 0);
      if (loansError) throw loansError;
      if ((activeLoans as unknown as { count: number }).count > 0) {
        return jsonResponse({ error: 'Cannot delete account: member has outstanding loan balance.' }, 409, origin);
      }
      const { data: staffRecord, error: staffError } = await admin
        .from('staff')
        .select('id, user_id')
        .eq('member_id', member.id)
        .eq('role', 'member')
        .maybeSingle();
      if (staffError) throw staffError;
      if (!staffRecord || !staffRecord.user_id) {
        return jsonResponse({ error: 'No linked Member Portal account was found.' }, 404, origin);
      }
      const { error: deleteAuthError } = await admin.auth.admin.deleteUser(staffRecord.user_id);
      if (deleteAuthError) throw deleteAuthError;
      const { error: unlinkError } = await admin
        .from('staff')
        .update({ user_id: null })
        .eq('id', staffRecord.id);
      if (unlinkError) throw unlinkError;
      await recordAccountEvent(admin, actor.id, member.id, 'MEMBER_ACCOUNT_DELETED');
      return jsonResponse({ deleted: true, member_number: member.member_number }, 200, origin);
    }

    if (member.membership_status !== 'active' || member.archived_at) {
      return jsonResponse({ error: 'Portal access is unavailable for archived members.' }, 409, origin);
    }

    const email = member.email?.trim().toLowerCase() || null;
    const authEmail = `${member.id}@members.amcoms.invalid`;
    const { data: linkedStaff, error: linkedError } = await admin.from('staff')
      .select('id, user_id, role, must_change_password, username')
      .eq('member_id', member.id)
      .maybeSingle();
    if (linkedError) throw linkedError;

    const { data: staffByEmail, error: staffEmailError } = email
      ? await admin.from('staff')
        .select('id, user_id, role, member_id')
        .ilike('email', email)
        .maybeSingle()
      : { data: null, error: null };
    if (staffEmailError) throw staffEmailError;
    if (staffByEmail && (staffByEmail.role !== 'member' || (staffByEmail.member_id && staffByEmail.member_id !== member.id))) {
      return jsonResponse({ error: 'This email is already associated with another account.' }, 409, origin);
    }

    const issueTempPassword = async (staffId: string, authUserId: string, eventName: string) => {
      const { data: authUserData, error: authUserError } = await admin.auth.admin.getUserById(authUserId);
      if (authUserError) throw authUserError;
      const existingAuthEmail = authUserData.user.email?.trim().toLowerCase() || '';
      if (existingAuthEmail !== authEmail) return jsonResponse({ error: 'The member login identity does not match the linked account.' }, 409, origin);

      const tempPassword = generateTempPassword();
      const { error: passwordError } = await admin.auth.admin.updateUserById(authUserId, { password: tempPassword });
      if (passwordError) throw passwordError;
      const { error: flagError } = await admin.from('staff').update({ must_change_password: true }).eq('id', staffId);
      if (flagError) throw flagError;
      await recordAccountEvent(admin, actor.id, member.id, eventName);
      return jsonResponse({
        sent: false,
        username: linkedStaff?.username || member.member_number,
        temporary_password: tempPassword,
        message: email
          ? 'Temporary credentials generated. Share them securely; the member must change the password after signing in.'
          : 'Temporary credentials generated. Share them securely; password recovery must be handled by staff until an email is added.'
      }, 200, origin);
    };

    if (action === 'reset' || action === 'resend-activation') {
      if (actor.role !== 'bookkeeper') {
        return jsonResponse({ error: 'Only Bookkeepers can reset member passwords.' }, 403, origin);
      }
      if (!linkedStaff?.user_id || linkedStaff.role !== 'member') {
        return jsonResponse({ error: 'No linked Member Portal account was found.' }, 404, origin);
      }
      if (action === 'resend-activation' && !linkedStaff.must_change_password) {
        return jsonResponse({ error: 'This account is already activated. Use password reset instead.' }, 409, origin);
      }
      return await issueTempPassword(
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
        return await issueTempPassword(linkedStaff.id, linkedStaff.user_id, 'MEMBER_ACTIVATION_RESENT');
      }
      return jsonResponse({ error: 'This member already has an activated account.' }, 409, origin);
    }

    let authUser = staffByEmail?.user_id ? null : await findAuthUserByEmail(admin, authEmail);
    let createdAuthUser = false;
    const tempPassword = generateTempPassword();
    if (!authUser && !staffByEmail?.user_id) {
      const { data: createdData, error: createError } = await admin.auth.admin.createUser({
        email: authEmail,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { member_number: member.member_number, username: member.member_number }
      });
      if (createError) throw createError;
      authUser = createdData.user;
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
      const { error: passwordError } = await admin.auth.admin.updateUserById(authUserId, { password: tempPassword });
      if (passwordError) throw passwordError;
    }
    const { error: flagError } = await admin.from('staff').update({ must_change_password: true })
      .eq('member_id', member.id).eq('role', 'member');
    if (flagError) throw flagError;
    await recordAccountEvent(admin, actor.id, member.id, 'MEMBER_ACCOUNT_CREATED');
    return jsonResponse({
      sent: false,
      username: linkedStaff?.username || member.member_number,
      temporary_password: tempPassword,
      message: email
        ? 'Member Portal account created. Share the temporary credentials securely; the member must change the password after signing in.'
        : 'Member Portal account created. Share the temporary credentials securely; password recovery must be handled by staff until an email is added.'
    }, 200, origin);
  } catch (error) {
    const errorMessage = error instanceof Error
      ? error.message
      : error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
      ? error.message
      : 'The member account action could not be completed.';
    console.error('Member account action failed:', errorMessage);
    return jsonResponse({ error: errorMessage }, 400, origin);
  }
});
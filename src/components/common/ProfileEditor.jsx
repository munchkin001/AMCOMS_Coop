import { useEffect, useState } from 'react';
import { Eye, EyeOff, KeyRound, Save, UserRound } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

const emptyProfile = {
  first_name: '',
  middle_name: '',
  last_name: '',
  email: '',
  phone: '',
  address: '',
  date_of_birth: '',
  emergency_contact_name: '',
  emergency_contact_phone: '',
  emergency_contact_relationship: ''
};

const fieldClass = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 disabled:bg-gray-50 disabled:text-gray-500';
const labelClass = 'mb-1.5 block text-sm font-medium text-gray-700';

const getAge = (dateOfBirth) => {
  if (!dateOfBirth) return '';
  const today = new Date();
  const birthDate = new Date(`${dateOfBirth}T00:00:00`);
  let age = today.getFullYear() - birthDate.getFullYear();
  const beforeBirthday = today.getMonth() < birthDate.getMonth()
    || (today.getMonth() === birthDate.getMonth() && today.getDate() < birthDate.getDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 ? String(age) : '';
};

const splitName = (fullName = '') => {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return {
    first_name: parts[0] || '',
    middle_name: parts.length > 2 ? parts.slice(1, -1).join(' ') : '',
    last_name: parts.length > 1 ? parts.at(-1) : ''
  };
};

const ProfileEditor = ({ profileType = 'staff', roleLabel }) => {
  const { user, staff } = useAuth();
  const [profile, setProfile] = useState(emptyProfile);
  const [memberSummary, setMemberSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileNotice, setProfileNotice] = useState('');
  const [password, setPassword] = useState({ current: '', next: '', confirm: '' });
  const [passwordError, setPasswordError] = useState('');
  const [passwordNotice, setPasswordNotice] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);

  useEffect(() => {
    let active = true;

    const loadProfile = async () => {
      if (!staff?.id || !user?.id) return;
      setLoading(true);
      setProfileError('');

      try {
        const { data: staffRecord, error: staffError } = await supabase
          .from('staff')
          .select('id, user_id, role, member_id, full_name, first_name, middle_name, last_name, email, phone, address, date_of_birth, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship')
          .eq('id', staff.id)
          .single();
        if (staffError) throw staffError;

        let memberRecord = null;
        if (profileType === 'member' && staffRecord.member_id) {
          const { data, error } = await supabase
            .from('members')
            .select('member_number, first_name, middle_name, last_name, email, phone, address, date_of_birth, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship, membership_status, date_joined, total_capital')
            .eq('id', staffRecord.member_id)
            .single();
          if (error) throw error;
          memberRecord = data;
        }

        if (!active) return;
        const source = memberRecord || staffRecord;
        const fallbackName = splitName(staffRecord.full_name);
        setProfile({
          ...emptyProfile,
          first_name: source.first_name || staffRecord.first_name || fallbackName.first_name,
          middle_name: source.middle_name || staffRecord.middle_name || fallbackName.middle_name,
          last_name: source.last_name || staffRecord.last_name || fallbackName.last_name,
          email: user.email || staffRecord.email || '',
          phone: source.phone || staffRecord.phone || '',
          address: source.address || staffRecord.address || '',
          date_of_birth: source.date_of_birth || staffRecord.date_of_birth || '',
          emergency_contact_name: source.emergency_contact_name || staffRecord.emergency_contact_name || '',
          emergency_contact_phone: source.emergency_contact_phone || staffRecord.emergency_contact_phone || '',
          emergency_contact_relationship: source.emergency_contact_relationship || staffRecord.emergency_contact_relationship || ''
        });
        setMemberSummary(memberRecord);
      } catch (error) {
        console.error('Unable to load profile:', error);
        if (active) setProfileError('Your profile could not be loaded. Please try again.');
      } finally {
        if (active) setLoading(false);
      }
    };

    loadProfile();
    return () => {
      active = false;
    };
  }, [profileType, staff?.id, staff?.member_id, user?.email, user?.id]);

  const handleProfileChange = (event) => {
    const { name, value } = event.target;
    setProfile((current) => ({ ...current, [name]: value }));
    setProfileError('');
    setProfileNotice('');
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    setSaving(true);
    setProfileError('');
    setProfileNotice('');

    try {
      const requestedEmail = profile.email.trim().toLowerCase();
      const currentEmail = user?.email?.toLowerCase() || '';
      let verifiedEmail = currentEmail;
      let emailConfirmationPending = false;

      if (requestedEmail !== currentEmail) {
        const { data, error } = await supabase.auth.updateUser({ email: requestedEmail });
        if (error) throw error;
        verifiedEmail = data.user?.email?.toLowerCase() || currentEmail;
        emailConfirmationPending = verifiedEmail !== requestedEmail;
      }

      const { error } = await supabase.rpc('update_own_profile', {
        p_profile: { ...profile, email: verifiedEmail }
      });
      if (error) throw error;

      if (!emailConfirmationPending) {
        setProfile((current) => ({ ...current, email: verifiedEmail }));
      }
      setProfileNotice(emailConfirmationPending
        ? 'Profile saved. Confirm the email change using the link sent to your new address.'
        : 'Your profile has been saved.');
    } catch (error) {
      console.error('Unable to save profile:', error);
      setProfileError(error.message || 'Your profile could not be saved. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const updatePassword = async (event) => {
    event.preventDefault();
    setPasswordError('');
    setPasswordNotice('');

    if (!user?.email || !password.current) {
      setPasswordError('Enter your current password to continue.');
      return;
    }
    if (password.next.length < 8) {
      setPasswordError('Use a password with at least 8 characters.');
      return;
    }
    if (password.next !== password.confirm) {
      setPasswordError('The new passwords do not match.');
      return;
    }

    setPasswordSaving(true);
    try {
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: password.current
      });
      if (verifyError) throw new Error('Your current password is incorrect.');

      const { error } = await supabase.auth.updateUser({ password: password.next });
      if (error) throw error;
      const { error: auditError } = await supabase.rpc('record_auth_event', { p_event: 'password changed' });
      if (auditError) console.error('Password change audit event could not be recorded.');

      setPassword({ current: '', next: '', confirm: '' });
      setPasswordNotice('Your password has been updated.');
    } catch (error) {
      console.error('Unable to update password:', error);
      setPasswordError(error.message || 'Your password could not be updated. Please try again.');
    } finally {
      setPasswordSaving(false);
    }
  };

  const roleName = roleLabel || staff?.role?.replaceAll('_', ' ') || 'Account';
  const inputType = showPasswords ? 'text' : 'password';

  if (loading) {
    return <div className="rounded-xl border border-gray-200 bg-white p-8 text-sm text-gray-600">Loading profile...</div>;
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-gray-200 bg-gray-50 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800">
              <UserRound aria-hidden="true" size={22} />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-gray-950">Personal information</h2>
              <p className="text-sm capitalize text-gray-600">{roleName}</p>
            </div>
          </div>
          {memberSummary && (
            <span className="w-fit rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800">
              Member #{memberSummary.member_number}
            </span>
          )}
        </div>

        <form onSubmit={saveProfile} className="space-y-6 p-5 sm:p-7">
          {profileError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{profileError}</p>}
          {profileNotice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{profileNotice}</p>}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label htmlFor="profile-first-name" className={labelClass}>First name</label>
              <input id="profile-first-name" name="first_name" autoComplete="given-name" required maxLength={80} value={profile.first_name} onChange={handleProfileChange} className={fieldClass} />
            </div>
            <div>
              <label htmlFor="profile-middle-name" className={labelClass}>Middle name</label>
              <input id="profile-middle-name" name="middle_name" autoComplete="additional-name" maxLength={80} value={profile.middle_name} onChange={handleProfileChange} className={fieldClass} />
            </div>
            <div>
              <label htmlFor="profile-last-name" className={labelClass}>Last name</label>
              <input id="profile-last-name" name="last_name" autoComplete="family-name" required maxLength={80} value={profile.last_name} onChange={handleProfileChange} className={fieldClass} />
            </div>
            <div>
              <label htmlFor="profile-date-of-birth" className={labelClass}>Date of birth</label>
              <input id="profile-date-of-birth" name="date_of_birth" type="date" autoComplete="bday" max={new Date().toISOString().slice(0, 10)} value={profile.date_of_birth} onChange={handleProfileChange} className={fieldClass} />
            </div>
            <div>
              <label htmlFor="profile-age" className={labelClass}>Age</label>
              <input id="profile-age" value={getAge(profile.date_of_birth)} readOnly placeholder="Calculated from date of birth" className={fieldClass} />
            </div>
            <div>
              <label htmlFor="profile-email" className={labelClass}>Email address</label>
              <input id="profile-email" name="email" type="email" autoComplete="email" required maxLength={254} value={profile.email} onChange={handleProfileChange} className={fieldClass} />
            </div>
            <div>
              <label htmlFor="profile-phone" className={labelClass}>Contact number</label>
              <input id="profile-phone" name="phone" type="tel" autoComplete="tel" maxLength={32} value={profile.phone} onChange={handleProfileChange} className={fieldClass} />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <label htmlFor="profile-address" className={labelClass}>Address</label>
              <textarea id="profile-address" name="address" autoComplete="street-address" rows={2} maxLength={300} value={profile.address} onChange={handleProfileChange} className={fieldClass} />
            </div>
          </div>

          <div className="border-t border-gray-200 pt-5">
            <h3 className="mb-4 text-base font-semibold text-gray-900">Emergency contact</h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label htmlFor="profile-emergency-name" className={labelClass}>Full name</label>
                <input id="profile-emergency-name" name="emergency_contact_name" autoComplete="off" maxLength={120} value={profile.emergency_contact_name} onChange={handleProfileChange} className={fieldClass} />
              </div>
              <div>
                <label htmlFor="profile-emergency-phone" className={labelClass}>Contact number</label>
                <input id="profile-emergency-phone" name="emergency_contact_phone" type="tel" autoComplete="off" maxLength={32} value={profile.emergency_contact_phone} onChange={handleProfileChange} className={fieldClass} />
              </div>
              <div>
                <label htmlFor="profile-emergency-relationship" className={labelClass}>Relationship</label>
                <input id="profile-emergency-relationship" name="emergency_contact_relationship" maxLength={80} value={profile.emergency_contact_relationship} onChange={handleProfileChange} className={fieldClass} placeholder="e.g. Parent, spouse, sibling" />
              </div>
            </div>
          </div>

          {memberSummary && (
            <div className="border-t border-gray-200 pt-5">
              <h3 className="mb-4 text-base font-semibold text-gray-900">Membership details</h3>
              <dl className="grid gap-4 sm:grid-cols-3">
                <div><dt className="text-xs font-medium uppercase text-gray-500">Status</dt><dd className="mt-1 text-sm font-medium capitalize text-gray-900">{memberSummary.membership_status || 'Not provided'}</dd></div>
                <div><dt className="text-xs font-medium uppercase text-gray-500">Member since</dt><dd className="mt-1 text-sm font-medium text-gray-900">{memberSummary.date_joined || 'Not provided'}</dd></div>
                <div><dt className="text-xs font-medium uppercase text-gray-500">Share capital</dt><dd className="mt-1 text-sm font-medium text-gray-900">{memberSummary.total_capital == null ? 'Not provided' : `₱${Number(memberSummary.total_capital).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`}</dd></div>
              </dl>
            </div>
          )}

          <div className="flex justify-end border-t border-gray-200 pt-5">
            <button type="submit" disabled={saving} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60">
              <Save aria-hidden="true" size={17} />
              {saving ? 'Saving...' : 'Save profile'}
            </button>
          </div>
        </form>
      </section>

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-gray-200 bg-gray-50 px-5 py-5 sm:px-7">
          <span className="flex size-11 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
            <KeyRound aria-hidden="true" size={21} />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-gray-950">Change password</h2>
            <p className="text-sm text-gray-600">Verify your current password before choosing a new one.</p>
          </div>
        </div>

        <form onSubmit={updatePassword} className="space-y-4 p-5 sm:p-7">
          {passwordError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{passwordError}</p>}
          {passwordNotice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{passwordNotice}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="current-password" className={labelClass}>Current password</label>
              <input id="current-password" type={inputType} autoComplete="current-password" required value={password.current} onChange={(event) => setPassword((current) => ({ ...current, current: event.target.value }))} className={fieldClass} />
            </div>
            <div>
              <label htmlFor="new-password" className={labelClass}>New password</label>
              <input id="new-password" type={inputType} autoComplete="new-password" minLength={8} required value={password.next} onChange={(event) => setPassword((current) => ({ ...current, next: event.target.value }))} className={fieldClass} />
            </div>
            <div>
              <label htmlFor="confirm-password" className={labelClass}>Confirm new password</label>
              <input id="confirm-password" type={inputType} autoComplete="new-password" minLength={8} required value={password.confirm} onChange={(event) => setPassword((current) => ({ ...current, confirm: event.target.value }))} className={fieldClass} />
            </div>
            <div className="flex items-end">
              <button type="button" onClick={() => setShowPasswords((visible) => !visible)} aria-pressed={showPasswords} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2">
                {showPasswords ? <EyeOff aria-hidden="true" size={17} /> : <Eye aria-hidden="true" size={17} />}
                {showPasswords ? 'Hide passwords' : 'Show passwords'}
              </button>
            </div>
          </div>
          <div className="flex justify-end border-t border-gray-200 pt-5">
            <button type="submit" disabled={passwordSaving} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-slate-800 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-700 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60">
              <KeyRound aria-hidden="true" size={17} />
              {passwordSaving ? 'Updating...' : 'Update password'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};

export default ProfileEditor;

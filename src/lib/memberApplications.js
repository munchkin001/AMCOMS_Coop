/**
 * Member application service
 *
 * Applications are submitted through a SECURITY DEFINER database function
 * rather than a direct table insert.
 *
 * Why: a direct insert needs the browser to supply user_id, which only works
 * if Supabase Auth happened to return a session. With email confirmation
 * enabled it does not, and the insert is rejected by RLS. The previous
 * workarounds for this were to disable RLS and drop the auth.users foreign
 * key, both of which weaken the whole table.
 *
 * The function takes no user_id. It stamps the row itself from the caller's
 * JWT, or leaves it null when there is no session yet. Either way the client
 * cannot claim an identity it does not hold.
 */

import { supabase } from '../lib/supabase';

/**
 * Submit a membership application.
 *
 * @param {Object} formData
 * @returns {Promise<{ success: boolean, applicationId: string|null, error: string|null }>}
 */
export const submitMemberApplication = async (formData) => {
  try {
    const { data, error } = await supabase.rpc('submit_member_application', {
      p_first_name: formData.firstName,
      p_middle_name: formData.middleName || null,
      p_last_name: formData.lastName,
      p_email: formData.email,
      p_phone: formData.phone,
      p_address: formData.address,
      p_barangay: formData.barangay || null,
      p_municipality: formData.municipality || null,
      p_province: formData.province || null,
      p_date_of_birth: formData.dateOfBirth || null,
      p_occupation: formData.occupation || null,
      p_gender: formData.gender || null,
      p_emergency_contact_name: formData.emergencyContactName || null,
      p_emergency_contact_phone: formData.emergencyContactPhone || null,
      p_rsbsa: formData.rsbsa || null,
      p_tin: formData.tin || null,
      p_ncfrs: formData.ncfrs || null,
      p_pca_id: formData.pcaId || null,
    });

    if (error) {
      // RAISE EXCEPTION messages from the function arrive here verbatim, and
      // they are already written to be shown to a member.
      return { success: false, applicationId: null, error: error.message };
    }

    return { success: true, applicationId: data, error: null };
  } catch (err) {
    return {
      success: false,
      applicationId: null,
      error: err?.message || 'Something went wrong. Please try again.',
    };
  }
};

/**
 * Attach a pending application to the signed-in user.
 *
 * Matches on the email in the verified JWT, so it cannot be used to claim
 * somebody else's application. Called on member login because an application
 * submitted before email confirmation has no user_id yet.
 *
 * @returns {Promise<{ linked: boolean, error: string|null }>}
 */
export const linkApplicationToCurrentUser = async () => {
  try {
    const { data, error } = await supabase.rpc('link_application_to_current_user');

    if (error) {
      // A failure here is not fatal: the approval trigger resolves user_id
      // from the email as well, so the application can still be approved.
      console.warn('Could not link application to user:', error.message);
      return { linked: false, error: error.message };
    }

    return { linked: Boolean(data), error: null };
  } catch (err) {
    console.warn('Could not link application to user:', err?.message);
    return { linked: false, error: err?.message || null };
  }
};

export default { submitMemberApplication, linkApplicationToCurrentUser };

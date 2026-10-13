import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { findStaffByLoginIdentifier } from '../lib/authHelpers';
import { useRealtimeSubscription } from '../hooks/useRealtimeSubscription';

const AuthContext = createContext({});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [staff, setStaff] = useState(null);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [authError, setAuthError] = useState(null);

  const logAuthEvent = useCallback(async (event) => {
    let lastError = null;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const { error } = await supabase.rpc('record_auth_event', { p_event: event });
      if (!error) return true;

      lastError = error;
      if (attempt < 3) {
        await new Promise((resolve) => window.setTimeout(resolve, 250));
      }
    }

    console.error(`Failed to record ${event} audit event after 3 attempts:`, lastError);
    return false;
  }, []);

  const fetchStaffProfile = async (userId) => {
    try {
      setAuthError(null);
      const { data, error } = await supabase
        .from('staff')
        .select('id, username, email, full_name, first_name, middle_name, last_name, phone, address, date_of_birth, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship, role, user_id, is_active, member_id, must_change_password, created_at')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;

      if (!data) {
        setAuthError('No staff profile found. Please contact the administrator.');
        setStaff(null);
        setLoading(false);
        return null;
      }

      console.log('Staff profile loaded:', { role: data.role, is_active: data.is_active });

      if (!data.is_active) {
        setAuthError('Your account has been deactivated. Please contact the administrator.');
        setStaff(null);
        setLoading(false);
        return null;
      }

      const validRoles = ['chairman', 'manager', 'treasurer', 'bookkeeper', 'inventory', 'member'];
      if (!validRoles.includes(data.role)) {
        console.error('Invalid role:', data.role);
        setAuthError('Invalid user role. Please contact the administrator.');
        setStaff(null);
        setLoading(false);
        return null;
      }

      let staffProfile = { ...data };
      if (data.role === 'member') {
        if (!data.member_id) {
          setAuthError('This account is not linked to an approved member. Contact the cooperative office.');
          setStaff(null);
          setLoading(false);
          return null;
        }
        const { data: member, error: memberError } = await supabase
          .from('members')
          .select('member_number, first_name, middle_name, last_name, phone, address, date_of_birth, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship, additional_emergency_contacts, membership_status, archived_at')
          .eq('id', data.member_id)
          .maybeSingle();
        if (memberError) throw memberError;
        if (!member || member.membership_status !== 'active' || member.archived_at) {
          setAuthError('This membership is not active. Contact the cooperative office.');
          setStaff(null);
          setLoading(false);
          return null;
        }
        staffProfile = { ...staffProfile, ...member };
      }

      console.log('Staff profile loaded successfully');
      setStaff(staffProfile);
      setAuthError(null);
      setLoading(false);
      return data;
    } catch (error) {
      console.error('Unexpected error fetching staff profile:', error);
      setAuthError('Failed to load user profile. Please try again.');
      setStaff(null);
      setLoading(false);
      return null;
    }
  };

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchStaffProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchStaffProfile(session.user.id);
        if (event === 'SIGNED_IN') {
          window.setTimeout(() => {
            logAuthEvent('sign in');
          }, 0);
        }
      } else {
        setStaff(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [logAuthEvent]);

  useRealtimeSubscription(
    'staff',
    () => user?.id && fetchStaffProfile(user.id),
    user?.id ? { column: 'user_id', value: user.id } : null,
    [user?.id],
    Boolean(user?.id)
  );

  const signIn = async (identifier, password) => {
    try {
      setAuthError(null);

      const { data: staffProfile, error: lookupError } = await findStaffByLoginIdentifier(identifier);
      if (lookupError) throw lookupError;
      if (!staffProfile) {
        throw new Error('Invalid username/full name or password');
      }
      if (!staffProfile.is_active) {
        throw new Error('Your account has been deactivated. Please contact the administrator.');
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: staffProfile.email,
        password,
      });

      if (error) throw error;

      // Fetch and validate staff profile
      let profile = null;
      if (data.user) {
        profile = await fetchStaffProfile(data.user.id);
        if (!profile) {
          // Profile fetch failed or user not authorized
          await supabase.auth.signOut();
          return { 
            data: null, 
            error: new Error('Unable to load user profile')
          };
        }

      }

      return { data, error: null, staff: profile, role: profile?.role };
    } catch (error) {
      console.error('Sign in error:', error);
      return { data: null, error };
    }
  };

  // Resolve the username to its private Auth alias before password authentication.
  const login = async (identifier, password) => {
    try {
      setAuthError(null);

      if (user) {
        const { error: signOutError } = await signOut();
        if (signOutError) {
          return {
            success: false,
            error: 'Could not safely switch accounts. Please sign out and try again.'
          };
        }
      }

      const { data: resolvedStaff, error: identifierLookupError, ambiguous } =
        await findStaffByLoginIdentifier(identifier);

      if (identifierLookupError) {
        console.error('Full-name account lookup failed:', identifierLookupError);
        return {
          success: false,
          error: 'The sign-in service is unavailable. Please contact the administrator.'
        };
      }

      if (ambiguous) {
        return {
          success: false,
          error: 'That full name matches more than one account. Use your unique username to sign in.'
        };
      }

      if (!resolvedStaff) {
        return {
          success: false,
          error: 'No account matched that username. Check it and try again, or contact the cooperative office.'
        };
      }

      if (!resolvedStaff.is_active) {
        return {
          success: false,
          error: 'Your account has been deactivated. Please contact the administrator.'
        };
      }

      // Authenticate with Supabase
      const { data, error } = await supabase.auth.signInWithPassword({
        email: resolvedStaff.email,
        password,
      });

      if (error) {
        console.error('Supabase password sign-in failed:', {
          projectHost: new URL(import.meta.env.VITE_SUPABASE_URL).host,
          code: error.code,
          status: error.status,
          message: error.message,
        });
        return {
          success: false,
          error: error.code === 'invalid_credentials'
            ? 'The password is incorrect for this account.'
            : 'Sign-in could not be completed. Please contact the administrator.'
        };
      }

      setSession(data.session);
      setUser(data.user);

      // Fetch and validate staff profile
      if (data.user) {
        const profile = await fetchStaffProfile(data.user.id);
        if (!profile) {
          await supabase.auth.signOut();
          return {
            success: false,
            error: 'Your credentials were accepted, but your profile could not be loaded. Contact the administrator.'
          };
        }

        return {
          success: true,
          data,
          role: profile.role,
          staff: profile
        };
      }

      return {
        success: false,
        error: 'Login failed'
      };

    } catch (error) {
      console.error('Login error:', error);
      return {
        success: false,
        error: 'An error occurred during login'
      };
    }
  };

  const signUp = async (email, password, metadata) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: metadata,
        },
      });

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      return { data: null, error };
    }
  };

  const signOut = async () => {
    try {
      setAuthError(null);
      await logAuthEvent('sign out');
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setStaff(null);
      setUser(null);
      setSession(null);
      return { error: null };
    } catch (error) {
      console.error('Sign out error:', error);
      return { error };
    }
  };

  const resetPassword = async () => {
    // Password reset is now handled by staff only through Chairman's Member Account Recovery
    // This function is kept for backward compatibility but should not be used
    console.warn('Password reset via email is disabled. Use Chairman\'s Member Account Recovery feature.');
    return { 
      error: new Error('Password reset must be done through the Chairman or authorized staff member.') 
    };
  };

  const updatePassword = async (newPassword) => {
    try {
      setAuthError(null);
      if (staff?.must_change_password) {
        const { error } = await supabase.functions.invoke('member-account', {
          body: { action: 'complete-password-setup', password: newPassword }
        });
        if (error) throw error;
        setStaff((current) => current ? { ...current, must_change_password: false } : current);
        return { error: null, activated: true };
      }

      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) throw error;
      return { error: null };
    } catch (error) {
      console.error('Update password error:', error);
      return { error };
    }
  };

  // Helper function to check if user has a specific role
  const hasRole = (role) => {
    return staff?.role === role && staff?.is_active;
  };

  // Helper function to check if user has any of the specified roles
  const hasAnyRole = (roles) => {
    return roles.includes(staff?.role) && staff?.is_active;
  };

  // Get user's member ID (for member portal users)
  const getMemberId = () => {
    return staff?.member_id || null;
  };

  const value = {
    user,
    staff,
    session,
    loading,
    authError,
    signIn,
    login, // Full-name-based login
    signUp,
    signOut,
    resetPassword,
    updatePassword,
    hasRole,
    hasAnyRole,
    getMemberId,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

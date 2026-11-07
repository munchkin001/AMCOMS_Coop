import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { getAppUrl } from '../lib/appUrl';
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

  const fetchStaffProfile = async (userId) => {
    try {
      setAuthError(null);
      const { data, error } = await supabase
        .from('staff')
        .select('id, email, full_name, role, user_id, is_active, member_id, must_change_password, created_at')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;

      if (!data) {
        setAuthError('No staff profile found. Please contact the administrator.');
        setStaff(null);
        setLoading(false);
        return null;
      }

      console.log('Staff data loaded:', { email: data.email, role: data.role, is_active: data.is_active });

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
          .select('member_number, membership_status, archived_at')
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
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchStaffProfile(session.user.id);
      } else {
        setStaff(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useRealtimeSubscription(
    'staff',
    () => user?.id && fetchStaffProfile(user.id),
    user?.id ? { column: 'user_id', value: user.id } : null,
    [user?.id],
    Boolean(user?.id)
  );

  const signIn = async (email, password) => {
    try {
      setAuthError(null);
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      // Fetch and validate staff profile
      if (data.user) {
        const staffData = await fetchStaffProfile(data.user.id);
        if (!staffData) {
          // Profile fetch failed or user not authorized
          await supabase.auth.signOut();
          return { 
            data: null, 
            error: new Error('Unable to load user profile')
          };
        }

        await logAuthEvent('sign in');
      }

      return { data, error: null };
    } catch (error) {
      console.error('Sign in error:', error);
      return { data: null, error };
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

  const logAuthEvent = async (event) => {
    const { error } = await supabase.rpc('record_auth_event', { p_event: event });
    if (error) {
      console.error(`Failed to record ${event} audit event:`, error);
    }
  };

  const resetPassword = async (email) => {
    try {
      setAuthError(null);
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${getAppUrl()}/reset-password`,
      });
      if (error) throw error;
      return { error: null };
    } catch (error) {
      console.error('Reset password error:', error);
      return { error };
    }
  };

  const updatePassword = async (newPassword) => {
    try {
      setAuthError(null);
      if (staff?.role === 'member' && staff.must_change_password) {
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

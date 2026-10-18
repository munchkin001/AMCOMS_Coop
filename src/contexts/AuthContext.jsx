import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { getAppUrl } from '../lib/appUrl';
import { findStaffByLoginIdentifier } from '../lib/authHelpers';
import { useRealtimeSubscription } from '../hooks/useRealtimeSubscription';
import offlineDb from '../lib/Offline/OfflineDb';

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
  const [offlineMode, setOfflineMode] = useState(false);
  const offlineModeRef = useRef(false);

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
        .select('id, email, username, full_name, role, user_id, is_active, member_id, must_change_password, created_at')
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
      offlineModeRef.current = false;
      setOfflineMode(false);
      setAuthError(null);
      try {
        await offlineDb.cachedData.put({
          key: `staff-profile:${userId}`,
          data: staffProfile,
          updatedAt: new Date().toISOString()
        });
      } catch (cacheError) {
        console.error('Unable to cache staff profile for offline access:', cacheError);
      }
      setLoading(false);
      return data;
    } catch (error) {
      console.error('Unexpected error fetching staff profile:', error);
      if (!navigator.onLine) {
        try {
          const cachedProfile = await offlineDb.cachedData.get(`staff-profile:${userId}`);
          const cachedStaff = cachedProfile?.data;
          const validRoles = ['chairman', 'manager', 'treasurer', 'bookkeeper', 'inventory', 'member'];
          if (
            cachedStaff?.user_id === userId &&
            cachedStaff.is_active === true &&
            validRoles.includes(cachedStaff.role) &&
            (cachedStaff.role !== 'member' || cachedStaff.member_id)
          ) {
            setStaff(cachedStaff);
            setAuthError(null);
            setLoading(false);
            return cachedStaff;
          }
        } catch (cacheError) {
          console.error('Unable to load cached staff profile:', cacheError);
        }
      }
      setAuthError('Failed to load user profile. Please try again.');
      setStaff(null);
      setLoading(false);
      return null;
    }
  };

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user && !navigator.onLine) {
        setSession(null);
        setUser(null);
        setStaff(null);
        setLoading(false);
        return;
      }
      if (!session && offlineModeRef.current && !navigator.onLine) {
        setSession(null);
        setLoading(false);
        return;
      }
      offlineModeRef.current = false;
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        setOfflineMode(false);
        fetchStaffProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user && !navigator.onLine) {
        setSession(null);
        if (!offlineModeRef.current) {
          setUser(null);
          setStaff(null);
        }
        setLoading(false);
        return;
      }
      if (!session && offlineModeRef.current && !navigator.onLine) {
        setSession(null);
        setLoading(false);
        return;
      }
      offlineModeRef.current = false;
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
        offlineModeRef.current = false;
        setOfflineMode(false);
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
      offlineModeRef.current = false;
      setOfflineMode(false);

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

      }

      return { data, error: null };
    } catch (error) {
      console.error('Sign in error:', error);
      return { data: null, error };
    }
  };

  // Resolve the username or unique full name before Supabase authentication.
  const login = async (identifier, password) => {
    try {
      setAuthError(null);
      
      const { data: staffData, error: lookupError } = await findStaffByLoginIdentifier(identifier);

      if (lookupError) {
        console.error('Full-name account lookup failed:', lookupError);
        return {
          success: false,
          error: 'An error occurred during login. Please try again.'
        };
      }

      if (!staffData) {
        return {
          success: false,
          error: 'Invalid username/full name or password'
        };
      }

      if (!staffData.is_active) {
        return {
          success: false,
          error: 'Your account has been deactivated. Please contact the administrator.'
        };
      }

      // Authenticate with Supabase
      const { data, error } = await supabase.auth.signInWithPassword({
        email: staffData.email,
        password,
      });

      if (error) {
        return {
          success: false,
          error: 'Invalid username/full name or password'
        };
      }

      // Fetch and validate staff profile
      if (data.user) {
        const staffData = await fetchStaffProfile(data.user.id);
        if (!staffData) {
          await supabase.auth.signOut();
          return {
            success: false,
            error: 'Unable to load user profile'
          };
        }

        return {
          success: true,
          data,
          role: staffData.role
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
    if (offlineMode) {
      setStaff(null);
      setUser(null);
      setSession(null);
      offlineModeRef.current = false;
      setOfflineMode(false);
      setAuthError(null);
      return { error: null };
    }

    try {
      setAuthError(null);
      await logAuthEvent('sign out');
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setStaff(null);
      setUser(null);
      setSession(null);
      offlineModeRef.current = false;
      setOfflineMode(false);
      return { error: null };
    } catch (error) {
      console.error('Sign out error:', error);
      return { error };
    }
  };

  const unlockOffline = ({ user: offlineUser, staff: offlineStaff }) => {
    const validRoles = ['chairman', 'manager', 'treasurer', 'bookkeeper', 'inventory', 'member'];
    if (
      !offlineUser?.id ||
      offlineUser.offline !== true ||
      offlineStaff?.user_id !== offlineUser.id ||
      offlineStaff.is_active !== true ||
      !validRoles.includes(offlineStaff.role)
    ) {
      throw new Error('The offline account could not be verified.');
    }
    setUser(offlineUser);
    setStaff(offlineStaff);
    setSession(null);
    setAuthError(null);
    offlineModeRef.current = true;
    setOfflineMode(true);
    setLoading(false);
  };

  const resetPassword = async (email) => {
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

      if (staff?.must_change_password) {
        const { error: setupError } = await supabase.rpc('complete_own_staff_password_setup');
        if (setupError) throw setupError;
        setStaff((current) => current ? { ...current, must_change_password: false } : current);
        return { error: null, activated: true };
      }

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
    offlineMode,
    signIn,
    login, // Full-name-based login
    signUp,
    signOut,
    unlockOffline,
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

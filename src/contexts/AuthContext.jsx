import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

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

  const fetchStaffProfile = async (userId) => {
    try {
      setAuthError(null);
      
      const { data, error } = await supabase
        .from('staff')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error) {
        // If no staff record found, user might not be authorized
        if (error.code === 'PGRST116') {
          setAuthError('No staff profile found. Please contact the administrator.');
          console.error('Staff profile not found for user:', userId);
        } else {
          throw error;
        }
        setStaff(null);
        return null;
      }

      // Validate staff record
      if (!data.is_active) {
        setAuthError('Your account has been deactivated. Please contact the administrator.');
        setStaff(null);
        return null;
      }

      // Validate role
      const validRoles = ['chairman', 'manager', 'treasurer', 'bookkeeper', 'inventory', 'member'];
      if (!validRoles.includes(data.role)) {
        setAuthError('Invalid user role. Please contact the administrator.');
        setStaff(null);
        return null;
      }

      setStaff(data);
      setAuthError(null);
      return data;
      
    } catch (error) {
      console.error('Error fetching staff profile:', error.message);
      setAuthError('Failed to load user profile. Please try again.');
      setStaff(null);
      return null;
    } finally {
      setLoading(false);
    }
  };

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
            error: new Error(authError || 'Unable to load user profile')
          };
        }
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

  const resetPassword = async (email) => {
    try {
      setAuthError(null);
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
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

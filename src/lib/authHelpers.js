/**
 * Authentication Helper Functions
 * Provides username-based authentication for AMCOMS
 */

import { supabase } from './supabase';

/**
 * Login with username and password
 * @param {string} username - The user's username
 * @param {string} password - The user's password
 * @returns {Promise<{success: boolean, data?: any, error?: string, role?: string}>}
 */
export async function loginWithUsername(username, password) {
  try {
    // Step 1: Look up the user's email by username
    const { data: staffData, error: lookupError } = await supabase
      .from('staff')
      .select('email, username, role, is_active, user_id')
      .eq('username', username.toLowerCase().trim())
      .maybeSingle();

    if (lookupError) {
      console.error('Username lookup error:', lookupError);
      return {
        success: false,
        error: 'An error occurred during login. Please try again.'
      };
    }

    if (!staffData) {
      return {
        success: false,
        error: 'Invalid username or password'
      };
    }

    if (!staffData.is_active) {
      return {
        success: false,
        error: 'Your account has been deactivated. Please contact the administrator.'
      };
    }

    // Step 2: Authenticate with Supabase using the email
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: staffData.email,
      password: password,
    });

    if (authError) {
      console.error('Authentication error:', authError);
      
      // Provide user-friendly error messages
      if (authError.message.includes('Invalid login credentials')) {
        return {
          success: false,
          error: 'Invalid username or password'
        };
      }
      
      return {
        success: false,
        error: 'Invalid username or password'
      };
    }

    if (!authData.user) {
      return {
        success: false,
        error: 'Login failed. Please try again.'
      };
    }

    // Step 3: Return success with role information
    return {
      success: true,
      data: authData,
      role: staffData.role
    };

  } catch (error) {
    console.error('Unexpected login error:', error);
    return {
      success: false,
      error: 'An unexpected error occurred. Please try again.'
    };
  }
}

/**
 * Update username for current user
 * @param {string} newUsername - The new username
 * @param {string} userId - The user's ID
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function updateUsername(newUsername, userId) {
  try {
    const trimmedUsername = newUsername.toLowerCase().trim();

    // Validate username format
    if (!/^[a-zA-Z0-9._]{3,30}$/.test(trimmedUsername)) {
      return {
        success: false,
        error: 'Username must be 3-30 characters and contain only letters, numbers, dots, and underscores.'
      };
    }

    // Check if username is already taken
    const { data: existing, error: checkError } = await supabase
      .from('staff')
      .select('id')
      .eq('username', trimmedUsername)
      .neq('user_id', userId)
      .maybeSingle();

    if (checkError) {
      console.error('Username check error:', checkError);
      return {
        success: false,
        error: 'Failed to validate username. Please try again.'
      };
    }

    if (existing) {
      return {
        success: false,
        error: 'This username is already taken. Please choose a different one.'
      };
    }

    // Update the username
    const { error: updateError } = await supabase
      .from('staff')
      .update({ username: trimmedUsername })
      .eq('user_id', userId);

    if (updateError) {
      console.error('Username update error:', updateError);
      return {
        success: false,
        error: 'Failed to update username. Please try again.'
      };
    }

    return {
      success: true
    };

  } catch (error) {
    console.error('Unexpected error updating username:', error);
    return {
      success: false,
      error: 'An unexpected error occurred. Please try again.'
    };
  }
}

/**
 * Check if username is available
 * @param {string} username - The username to check
 * @param {string} currentUserId - Current user ID (to exclude from check)
 * @returns {Promise<{available: boolean, error?: string}>}
 */
export async function checkUsernameAvailability(username, currentUserId = null) {
  try {
    const trimmedUsername = username.toLowerCase().trim();

    if (!/^[a-zA-Z0-9._]{3,30}$/.test(trimmedUsername)) {
      return {
        available: false,
        error: 'Invalid username format'
      };
    }

    let query = supabase
      .from('staff')
      .select('id')
      .eq('username', trimmedUsername);

    if (currentUserId) {
      query = query.neq('user_id', currentUserId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      console.error('Username availability check error:', error);
      return {
        available: false,
        error: 'Failed to check username availability'
      };
    }

    return {
      available: !data
    };

  } catch (error) {
    console.error('Unexpected error checking username:', error);
    return {
      available: false,
      error: 'An unexpected error occurred'
    };
  }
}

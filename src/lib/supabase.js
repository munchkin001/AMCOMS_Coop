import { createClient } from '@supabase/supabase-js';
import { withActionNotifications } from './actionNotifications';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const REMEMBER_ME_KEY = 'amcoms_remember';

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please check your .env.local file.');
}

const authStorage = {
  getItem: async (key) => {
    if (localStorage.getItem(REMEMBER_ME_KEY) === 'true') {
      return localStorage.getItem(key);
    }

    const sessionValue = sessionStorage.getItem(key);
    localStorage.removeItem(key);
    return sessionValue;
  },
  setItem: async (key, value) => {
    if (localStorage.getItem(REMEMBER_ME_KEY) === 'true') {
      localStorage.setItem(key, value);
      sessionStorage.removeItem(key);
      return;
    }

    sessionStorage.setItem(key, value);
    localStorage.removeItem(key);
  },
  removeItem: async (key) => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  }
};

export const setRememberMePreference = (remember) => {
  if (remember) {
    localStorage.setItem(REMEMBER_ME_KEY, 'true');
  } else {
    localStorage.removeItem(REMEMBER_ME_KEY);
  }
};

export const clearRememberMePreference = () => {
  localStorage.removeItem(REMEMBER_ME_KEY);
};

export const supabase = withActionNotifications(createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: authStorage,
    persistSession: true
  }
}));

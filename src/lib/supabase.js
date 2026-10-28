import { createClient } from '@supabase/supabase-js';
import { withActionNotifications } from './actionNotifications';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please check your .env.local file.');
}

export const supabase = withActionNotifications(createClient(supabaseUrl, supabaseAnonKey));

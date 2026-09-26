/**
 * Script to create test users in Supabase
 * Run this with: node scripts/create-test-users.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_KEY; // You'll need to add this

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables');
  console.error('Make sure VITE_SUPABASE_URL and VITE_SUPABASE_SERVICE_KEY are set in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const testUsers = [
  {
    email: 'chairman@amcoms.com',
    password: 'chairman123',
    full_name: 'John Chairman',
    username: 'chairman',
    role: 'chairman'
  },
  {
    email: 'manager@amcoms.com',
    password: 'manager123',
    full_name: 'Jane Manager',
    username: 'manager',
    role: 'manager'
  },
  {
    email: 'treasurer@amcoms.com',
    password: 'treasurer123',
    full_name: 'Bob Treasurer',
    username: 'treasurer',
    role: 'treasurer'
  },
  {
    email: 'bookkeeper@amcoms.com',
    password: 'bookkeeper123',
    full_name: 'Alice Bookkeeper',
    username: 'bookkeeper',
    role: 'bookkeeper'
  },
  {
    email: 'inventory@amcoms.com',
    password: 'inventory123',
    full_name: 'Tom Inventory',
    username: 'inventory',
    role: 'inventory'
  },
  {
    email: 'member@amcoms.com',
    password: 'member123',
    full_name: 'Sarah Member',
    username: 'member',
    role: 'member'
  }
];

async function createTestUsers() {
  console.log('🚀 Creating test users...\n');

  for (const user of testUsers) {
    try {
      // Create auth user
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: user.email,
        password: user.password,
        email_confirm: true,
        user_metadata: {
          full_name: user.full_name,
          role: user.role
        }
      });

      if (authError) {
        console.error(`❌ Error creating auth user for ${user.email}:`, authError.message);
        continue;
      }

      console.log(`✅ Created auth user: ${user.email}`);

      // Create staff profile
      const { error: staffError } = await supabase
        .from('staff')
        .insert({
          user_id: authData.user.id,
          username: user.username,
          email: user.email,
          full_name: user.full_name,
          role: user.role,
          is_active: true
        });

      if (staffError) {
        console.error(`❌ Error creating staff profile for ${user.email}:`, staffError.message);
      } else {
        console.log(`✅ Created staff profile: ${user.full_name} (${user.role})`);
      }

      console.log('');
    } catch (error) {
      console.error(`❌ Unexpected error for ${user.email}:`, error.message);
    }
  }

  console.log('✨ Test user creation complete!\n');
  console.log('📝 Test Credentials:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  testUsers.forEach(user => {
    console.log(`${user.role.padEnd(12)} | ${user.email.padEnd(25)} | ${user.password}`);
  });
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

createTestUsers().catch(console.error);

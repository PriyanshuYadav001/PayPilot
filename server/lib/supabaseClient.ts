import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../types/database.types';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({
  path: path.resolve(process.cwd(), 'server/.env'),
});

const supabaseUrl =
  process.env.SUPABASE_URL || 'https://placeholder-project.supabase.co';

const supabaseServiceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  'placeholder-key';

const supabaseClient = createClient<Database>(
  supabaseUrl,
  supabaseServiceRoleKey,
);

type CallableSupabaseClient = SupabaseClient<Database> & (() => {
  supabase: SupabaseClient<Database>;
  user: undefined;
});

// A few legacy services still use the old factory-shaped client. Keeping this
// callable facade avoids changing their runtime behavior while active services
// use the normal Supabase client surface.
export const supabaseServer = Object.assign(
  (() => ({ supabase: supabaseClient, user: undefined })) as CallableSupabaseClient,
  supabaseClient,
);
import { createClient } from '@supabase/supabase-js';
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

export const supabaseServer = createClient(
  supabaseUrl,
  supabaseServiceRoleKey,
);
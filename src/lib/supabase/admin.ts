import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

// Service-role client: bypasses RLS. Server-only, used until Supabase Auth is wired into the dashboard.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secretKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY");
  }

  return createClient<Database>(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

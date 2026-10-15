"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseEnvironment } from "./environment";

/** Para Client Components; createBrowserClient gestiona la instancia browser. */
export function createClient() {
  const { url, publishableKey } = getSupabaseEnvironment();
  return createBrowserClient(url, publishableKey);
}

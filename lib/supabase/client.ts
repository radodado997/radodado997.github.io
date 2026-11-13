import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";

// Klient przeglądarkowy: używa wyłącznie klucza publikowalnego (anon).
// Bezpieczeństwo zapewniają RLS i funkcje SECURITY DEFINER w bazie.
export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

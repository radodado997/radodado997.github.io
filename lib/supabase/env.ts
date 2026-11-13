// Odczyt zmiennych środowiskowych. Nazwy muszą być dosłowne, żeby Next.js
// mógł podstawić je w kodzie przeglądarki (NEXT_PUBLIC_*).
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Brak NEXT_PUBLIC_SUPABASE_URL lub NEXT_PUBLIC_SUPABASE_ANON_KEY. Uzupełnij .env.local.",
  );
}

export const SUPABASE_URL: string = url;
export const SUPABASE_ANON_KEY: string = anonKey;

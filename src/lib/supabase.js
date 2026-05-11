// Klient Supabase dla komponentów klienckich ("use client").
// Używa @supabase/ssr → sesja trzymana w COOKIES, dzięki czemu middleware
// po stronie serwera widzi zalogowanego użytkownika.
import { createBrowserClient } from '@supabase/ssr';

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

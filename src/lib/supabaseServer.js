// Klient Supabase dla SERWERA (server components, layouty, route handlers).
// Czyta sesję z cookies przy każdym żądaniu.
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createSupabaseServer() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // W server components nie można ustawiać cookies —
            // odświeżenie sesji obsługuje middleware.
          }
        },
      },
    }
  );
}

// Pomocnik: zwraca aktualnie zalogowanego usera + jego rolę.
// Zwraca null, jeśli niezalogowany albo profil nie istnieje.
export async function getSessionWithRole() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, role, company_id')
    .eq('id', user.id)
    .single();

  if (!profile) return { user, profile: null };
  return { user, profile };
}

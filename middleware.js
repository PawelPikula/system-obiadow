// Middleware Next.js — uruchamia się PRZED renderem każdej trasy z `matcher`.
// Robi dwie rzeczy:
//   1. Odświeża sesję Supabase (cookies) — bez tego sesja w SSR przygasa po godzinie.
//   2. Odrzuca niezalogowanych z chronionych tras (przekierowuje na /login).
//
// Sprawdzenie konkretnej ROLI (admin/restaurant) robią layouty w app/admin,
// app/restauracja, app/kuchnia — tutaj tylko podstawowa autoryzacja.

import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const PUBLIC_PATHS = ['/login'];

export async function middleware(request) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // WAŻNE: getUser MUSI być pierwszym wywołaniem po stworzeniu klienta —
  // wtedy biblioteka prawidłowo odświeży cookies sesji.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.includes(path);

  // Niezalogowany na chronionej trasie → /login
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Zalogowany na /login → strona główna
  if (user && path === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return response;
}

// Trasy, których middleware NIE rusza: assety i pliki statyczne.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};

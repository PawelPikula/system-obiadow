"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';
import MenuCart from '../components/MenuCart';

export default function Home() {
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/login');
        return;
      }
      if (cancelled) return;

      const { data: profileData } = await supabase
        .from('profiles')
        .select(`first_name, last_name, role, companies ( name, payment_model, daily_subsidy )`)
        .eq('id', session.user.id)
        .single();

      if (cancelled) return;

      if (profileData?.role === 'admin') { router.replace('/admin'); return; }
      if (profileData?.role === 'restaurant') { router.replace('/restauracja'); return; }

      setProfile(profileData);
      setLoading(false);
    }
    fetchData();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-blue-500" />
      </div>
    );
  }

  return (
    <main className="min-h-screen relative bg-gradient-premium p-4 md:p-8 font-sans overflow-hidden">
      {/* Animowane tła (blobs) */}
      <div className="absolute top-0 -left-10 w-96 h-96 bg-blue-300 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob" />
      <div 
        className="absolute top-20 -right-10 w-96 h-96 bg-indigo-300 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob" 
        style={{ animationDelay: '2s' }} 
      />
      <div 
        className="absolute -bottom-20 left-1/2 w-96 h-96 bg-purple-300 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob" 
        style={{ animationDelay: '4s' }} 
      />

      <div className="max-w-4xl mx-auto flex flex-col items-center relative z-10 animate-fade-in">
        <header className="w-full max-w-md flex justify-between items-center mb-8 glass p-6 rounded-3xl">
          <div>
            <p className="text-sm font-medium text-slate-500">Witaj z powrotem,</p>
            <h1 className="text-xl font-heading font-black text-slate-800">{profile?.first_name}!</h1>
            <p className="text-xs text-gradient font-bold uppercase mt-1 tracking-wide">
              {profile?.companies?.name}
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/historia"
              className="px-4 py-2 bg-white/60 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-white hover:shadow-md transition-all backdrop-blur-sm"
            >
              Zamówienia
            </Link>
            <Link
              href="/ustawienia"
              className="px-4 py-2 bg-white/60 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-white hover:shadow-md transition-all backdrop-blur-sm"
              aria-label="Ustawienia"
            >
              ⚙
            </Link>
            <button
              onClick={handleSignOut}
              className="px-4 py-2 bg-red-50/80 border border-red-100 text-red-600 rounded-xl text-sm font-bold hover:bg-red-100 hover:shadow-md transition-all backdrop-blur-sm"
              aria-label="Wyloguj się"
            >
              Wyloguj
            </button>
          </div>
        </header>

        {!profile?.companies ? (
          <div className="glass p-8 rounded-3xl text-center">
            <p className="text-slate-600 font-medium">Oczekiwanie na przypisanie do firmy…</p>
            <div className="mt-4 animate-spin rounded-full h-8 w-8 border-t-2 border-blue-500 mx-auto" />
          </div>
        ) : (
          <MenuCart userProfile={profile} />
        )}
      </div>
    </main>
  );
}

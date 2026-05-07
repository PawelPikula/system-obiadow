"use client";
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import MenuCart from '../components/MenuCart';

export default function Home() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = '/login'; return; }
      setUser(session.user);

      const { data: profileData } = await supabase
        .from('profiles')
        .select(`first_name, last_name, companies ( name, payment_model, daily_subsidy )`)
        .eq('id', session.user.id).single();

      setProfile(profileData);
      setLoading(false);
    }
    fetchData();
  }, []);

  if (loading) return <div className="min-h-screen flex items-center justify-center">Wczytywanie...</div>;

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans">
      <div className="max-w-4xl mx-auto flex flex-col items-center">
        <header className="w-full max-w-md flex justify-between items-center mb-8 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
          <div>
            <h1 className="text-lg font-bold">Witaj, {profile?.first_name}!</h1>
            <p className="text-xs text-blue-600 font-bold uppercase">{profile?.companies?.name}</p>
          </div>
          <div className="flex gap-2">
            <a href="/historia" className="p-2 bg-slate-100 rounded-lg text-xs font-bold">Historia</a>
            <button onClick={() => supabase.auth.signOut().then(() => window.location.href='/login')} className="p-2 bg-red-50 text-red-600 rounded-lg text-xs font-bold">X</button>
          </div>
        </header>

        {!profile?.companies ? (
          <p>Oczekiwanie na przypisanie do firmy...</p>
        ) : (
          <MenuCart userProfile={profile} userId={user.id} />
        )}
      </div>
    </main>
  );
}
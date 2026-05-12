"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';

export default function ResetHaslaPage() {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    // Supabase przetwarza token z URL i emituje PASSWORD_RECOVERY
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setSessionReady(true);
      }
    });

    // Jeśli sesja już istnieje (użytkownik wrócił na stronę)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setSessionReady(true);
    });

    // Jeśli po 8s nadal nie ma sesji — link wygasł lub nieprawidłowy
    const timeout = setTimeout(() => {
      setExpired(true);
    }, 8000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  // Wyczyść flagę timeout gdy sesja się pojawi
  useEffect(() => {
    if (sessionReady) setExpired(false);
  }, [sessionReady]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error('Hasła nie są identyczne.');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('Hasło musi mieć co najmniej 6 znaków.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);
    if (error) {
      toast.error(error.message || 'Nie udało się zmienić hasła.');
    } else {
      toast.success('Hasło zostało zmienione! Zaloguj się nowym hasłem.');
      await supabase.auth.signOut();
      router.replace('/login');
    }
  };

  const blobBg = (
    <>
      <div className="absolute top-0 -left-4 w-72 h-72 bg-purple-300 rounded-full mix-blend-multiply filter blur-2xl opacity-70 animate-blob" />
      <div className="absolute top-0 -right-4 w-72 h-72 bg-blue-300 rounded-full mix-blend-multiply filter blur-2xl opacity-70 animate-blob" style={{ animationDelay: '2s' }} />
      <div className="absolute -bottom-8 left-20 w-72 h-72 bg-indigo-300 rounded-full mix-blend-multiply filter blur-2xl opacity-70 animate-blob" style={{ animationDelay: '4s' }} />
    </>
  );

  if (!sessionReady && !expired) {
    return (
      <main className="min-h-screen relative flex items-center justify-center p-4 overflow-hidden bg-gradient-premium">
        {blobBg}
        <div className="glass p-10 rounded-3xl text-center max-w-sm w-full z-10 animate-fade-in">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-blue-500 mx-auto mb-5" />
          <p className="text-slate-700 font-bold">Weryfikacja linku resetującego…</p>
          <p className="text-slate-400 text-sm mt-2">To potrwa chwilę.</p>
        </div>
      </main>
    );
  }

  if (expired && !sessionReady) {
    return (
      <main className="min-h-screen relative flex items-center justify-center p-4 overflow-hidden bg-gradient-premium">
        {blobBg}
        <div className="glass p-10 rounded-3xl text-center max-w-sm w-full z-10 animate-fade-in">
          <p className="text-4xl mb-4">⏰</p>
          <h1 className="text-2xl font-heading font-black text-slate-800 mb-3">Link wygasł</h1>
          <p className="text-slate-500 font-medium text-sm mb-6">
            Link do resetowania hasła jest nieprawidłowy lub wygasł. Poproś o nowy.
          </p>
          <button
            onClick={() => router.replace('/login')}
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold py-3 rounded-xl shadow-lg hover:-translate-y-0.5 transition-all"
          >
            Wróć do logowania
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen relative flex items-center justify-center p-4 overflow-hidden bg-gradient-premium">
      {blobBg}
      <div className="glass p-8 md:p-10 rounded-3xl max-w-sm w-full z-10 animate-fade-in">
        <div className="text-center mb-8">
          <p className="text-4xl mb-3">🔑</p>
          <h1 className="text-3xl font-heading font-black text-gradient">Nowe hasło</h1>
          <p className="text-slate-500 text-sm mt-2 font-medium">Podaj nowe hasło do swojego konta.</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="password"
            placeholder="Nowe hasło (min. 6 znaków)"
            required
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full p-3 bg-white/60 border border-slate-200 rounded-xl text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all shadow-sm backdrop-blur-sm"
          />
          <input
            type="password"
            placeholder="Powtórz nowe hasło"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full p-3 bg-white/60 border border-slate-200 rounded-xl text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all shadow-sm backdrop-blur-sm"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold py-3.5 rounded-xl shadow-[0_4px_14px_0_rgba(79,70,229,0.39)] hover:shadow-[0_6px_20px_rgba(79,70,229,0.23)] hover:-translate-y-0.5 hover:from-blue-700 hover:to-indigo-700 transition-all duration-300 disabled:opacity-70 disabled:transform-none disabled:shadow-none mt-2"
          >
            {loading ? 'Zapisywanie…' : 'Ustaw nowe hasło'}
          </button>
        </form>
      </div>
    </main>
  );
}

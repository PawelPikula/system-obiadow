"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [isLoginView, setIsLoginView] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLoginView) {
        // --- LOGOWANIE ---
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success('Zalogowano!');
        router.replace('/');
        router.refresh();
      } else {
        // --- REJESTRACJA ---
        // Imię i nazwisko lecą w options.data → raw_user_meta_data.
        // Wpis w public.profiles tworzy trigger handle_new_user.
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { first_name: firstName, last_name: lastName },
          },
        });

        if (signUpError) throw signUpError;
        toast.success('Konto utworzone! Możesz się zalogować.');
        setIsLoginView(true);
      }
    } catch (error) {
      toast.error(error.message || 'Coś poszło nie tak.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen relative flex items-center justify-center p-4 overflow-hidden bg-gradient-premium">
      {/* Animowane tła (blobs) */}
      <div className="absolute top-0 -left-4 w-72 h-72 bg-purple-300 rounded-full mix-blend-multiply filter blur-2xl opacity-70 animate-blob" />
      <div 
        className="absolute top-0 -right-4 w-72 h-72 bg-yellow-300 rounded-full mix-blend-multiply filter blur-2xl opacity-70 animate-blob" 
        style={{ animationDelay: '2s' }} 
      />
      <div 
        className="absolute -bottom-8 left-20 w-72 h-72 bg-pink-300 rounded-full mix-blend-multiply filter blur-2xl opacity-70 animate-blob" 
        style={{ animationDelay: '4s' }} 
      />

      <div className="glass p-8 md:p-10 rounded-3xl max-w-sm w-full z-10 animate-fade-in relative">
        <h1 className="text-3xl font-heading font-black text-center text-gradient mb-8">
          {isLoginView ? 'Witaj z powrotem!' : 'Załóż konto'}
        </h1>

        <form onSubmit={handleAuth} className="flex flex-col gap-4">
          {!isLoginView && (
            <div className="flex gap-2 animate-slide-up">
              <input
                type="text"
                placeholder="Imię"
                required
                className="w-1/2 p-3 bg-white/60 border border-slate-200 rounded-xl text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all shadow-sm backdrop-blur-sm"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
              <input
                type="text"
                placeholder="Nazwisko"
                required
                className="w-1/2 p-3 bg-white/60 border border-slate-200 rounded-xl text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all shadow-sm backdrop-blur-sm"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          )}

          <input
            type="email"
            placeholder="E-mail"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full p-3 bg-white/60 border border-slate-200 rounded-xl text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all shadow-sm backdrop-blur-sm"
          />

          <input
            type="password"
            placeholder="Hasło"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full p-3 bg-white/60 border border-slate-200 rounded-xl text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all shadow-sm backdrop-blur-sm"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold py-3.5 rounded-xl shadow-[0_4px_14px_0_rgba(79,70,229,0.39)] hover:shadow-[0_6px_20px_rgba(79,70,229,0.23)] hover:-translate-y-0.5 hover:from-blue-700 hover:to-indigo-700 transition-all duration-300 disabled:opacity-70 disabled:transform-none disabled:shadow-none mt-2"
          >
            {loading ? 'Przetwarzanie…' : isLoginView ? 'Zaloguj się' : 'Zarejestruj mnie'}
          </button>
        </form>

        <div className="mt-8 text-center text-sm">
          <button
            onClick={() => setIsLoginView(!isLoginView)}
            className="text-slate-500 font-medium hover:text-blue-600 transition-colors"
          >
            {isLoginView ? 'Nie masz konta? Załóż je tutaj' : 'Masz już konto? Zaloguj się'}
          </button>
        </div>
      </div>
    </main>
  );
}

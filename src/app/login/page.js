"use client";
import { useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function LoginPage() {
  const [isLoginView, setIsLoginView] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState(''); // Nowe
  const [lastName, setLastName] = useState('');   // Nowe
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ text: '', type: '' });

    try {
      if (isLoginView) {
        // --- LOGOWANIE ---
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setMessage({ text: 'Zalogowano! Przekierowanie...', type: 'success' });
        setTimeout(() => window.location.href = '/', 1500);

      } else {
        // --- REJESTRACJA ---
        const { data, error: signUpError } = await supabase.auth.signUp({ 
          email, 
          password,
        });

        if (signUpError) throw signUpError;

        // Jeśli rejestracja w Auth się udała, tworzymy profil w naszej tabeli profiles
        if (data.user) {
          const { error: profileError } = await supabase
            .from('profiles')
            .insert([
              { 
                id: data.user.id, // Łączymy ID z systemu logowania z ID w tabeli
                first_name: firstName, 
                last_name: lastName,
                // Nie podajemy company_id - będzie NULL, dopóki go nie zatwierdzisz!
              }
            ]);
          
          if (profileError) throw profileError;
        }

        setMessage({ text: 'Konto utworzone! Możesz się zalogować.', type: 'success' });
        setIsLoginView(true);
      }
    } catch (error) {
      setMessage({ text: error.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans">
      <div className="bg-white p-8 rounded-2xl shadow-xl max-w-sm w-full">
        <h1 className="text-2xl font-bold text-center text-blue-600 mb-6">
          {isLoginView ? 'Witaj z powrotem!' : 'Załóż konto'}
        </h1>

        <form onSubmit={handleAuth} className="flex flex-col gap-4">
          {!isLoginView && (
            <>
              <div className="flex gap-2">
                <input 
                  type="text" placeholder="Imię" required
                  className="w-1/2 p-3 border border-gray-300 rounded-lg text-black outline-none focus:ring-2 focus:ring-blue-500"
                  onChange={(e) => setFirstName(e.target.value)}
                />
                <input 
                  type="text" placeholder="Nazwisko" required
                  className="w-1/2 p-3 border border-gray-300 rounded-lg text-black outline-none focus:ring-2 focus:ring-blue-500"
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
            </>
          )}

          <input 
            type="email" placeholder="E-mail" required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-lg text-black outline-none focus:ring-2 focus:ring-blue-500"
          />

          <input 
            type="password" placeholder="Hasło" required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-lg text-black outline-none focus:ring-2 focus:ring-blue-500"
          />

          {message.text && (
            <div className={`p-3 rounded-lg text-sm font-medium ${message.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
              {message.text}
            </div>
          )}

          <button 
            type="submit" disabled={loading}
            className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 transition disabled:bg-blue-400"
          >
            {loading ? 'Przetwarzanie...' : (isLoginView ? 'Zaloguj się' : 'Zarejestruj mnie')}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-gray-600">
          <button 
            onClick={() => { setIsLoginView(!isLoginView); setMessage({ text: '', type: '' }); }}
            className="text-blue-600 font-bold hover:underline"
          >
            {isLoginView ? 'Nie masz konta? Załóż je tutaj' : 'Masz już konto? Zaloguj się'}
          </button>
        </div>
      </div>
    </main>
  );
}
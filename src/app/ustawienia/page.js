"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';

export default function UstawieniaPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace('/login');
        return;
      }
      setLoading(false);
    });
  }, [router]);

  async function handleChangePassword(e) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error('Nowe hasła nie są identyczne.');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('Hasło musi mieć co najmniej 6 znaków.');
      return;
    }

    setSaving(true);
    try {
      // Re-authenticate with current password first
      const { data: { user } } = await supabase.auth.getUser();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (signInError) {
        toast.error('Obecne hasło jest nieprawidłowe.');
        return;
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      toast.success('Hasło zostało zmienione.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      toast.error(error.message || 'Nie udało się zmienić hasła.');
    } finally {
      setSaving(false);
    }
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
      <div className="absolute top-0 -left-10 w-96 h-96 bg-blue-300 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob" />
      <div
        className="absolute top-20 -right-10 w-96 h-96 bg-indigo-300 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob"
        style={{ animationDelay: '2s' }}
      />

      <div className="max-w-md mx-auto flex flex-col items-center relative z-10 animate-fade-in">
        <header className="w-full flex justify-between items-center mb-8 glass p-6 rounded-3xl">
          <h1 className="text-xl font-heading font-black text-slate-800">Ustawienia</h1>
          <Link
            href="/"
            className="px-4 py-2 bg-white/60 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-white hover:shadow-md transition-all backdrop-blur-sm"
          >
            ← Powrót
          </Link>
        </header>

        <div className="w-full glass p-8 rounded-3xl">
          <h2 className="text-lg font-heading font-bold text-slate-800 mb-6">Zmień hasło</h2>
          <form onSubmit={handleChangePassword} className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">
                Obecne hasło
              </label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full p-3 bg-white/60 border border-slate-200 rounded-xl text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all shadow-sm backdrop-blur-sm"
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">
                Nowe hasło
              </label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full p-3 bg-white/60 border border-slate-200 rounded-xl text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all shadow-sm backdrop-blur-sm"
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">
                Powtórz nowe hasło
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full p-3 bg-white/60 border border-slate-200 rounded-xl text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all shadow-sm backdrop-blur-sm"
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold py-3.5 rounded-xl shadow-[0_4px_14px_0_rgba(79,70,229,0.39)] hover:shadow-[0_6px_20px_rgba(79,70,229,0.23)] hover:-translate-y-0.5 hover:from-blue-700 hover:to-indigo-700 transition-all duration-300 disabled:opacity-70 disabled:transform-none disabled:shadow-none mt-2"
            >
              {saving ? 'Zapisywanie…' : 'Zmień hasło'}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

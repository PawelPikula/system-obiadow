"use client";
import { useEffect } from 'react';

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    // tu w prod sentry / logflare
    console.error(error);
  }, [error]);

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
      <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 max-w-md w-full text-center">
        <div className="text-5xl mb-4">😵</div>
        <h1 className="text-xl font-black text-slate-800 mb-2">Coś poszło nie tak</h1>
        <p className="text-slate-500 text-sm mb-6">
          {error?.message || 'Nieoczekiwany błąd aplikacji.'}
        </p>
        <div className="flex gap-2 justify-center">
          <button
            onClick={reset}
            className="px-5 py-2.5 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 transition shadow-sm"
          >
            Spróbuj ponownie
          </button>
          <a
            href="/"
            className="px-5 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold text-sm hover:bg-slate-200 transition"
          >
            Strona główna
          </a>
        </div>
      </div>
    </main>
  );
}

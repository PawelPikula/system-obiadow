import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
      <div className="bg-white p-10 rounded-3xl shadow-sm border border-slate-200 max-w-md w-full text-center">
        <div className="text-6xl mb-4">🍽️</div>
        <h1 className="text-3xl font-black text-slate-800 mb-2">404</h1>
        <p className="text-slate-500 mb-6">Tej strony nie ma w menu.</p>
        <Link
          href="/"
          className="inline-block px-6 py-3 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 transition shadow-sm"
        >
          Wróć do strony głównej
        </Link>
      </div>
    </main>
  );
}

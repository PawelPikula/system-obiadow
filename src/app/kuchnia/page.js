// Server Component — używa klienta serwerowego (cookies + RLS).
// Guard roli realizuje src/app/kuchnia/layout.js.

export const dynamic = 'force-dynamic'; // świeże dane przy każdym żądaniu

import { createSupabaseServer } from '@/lib/supabaseServer';

export default async function KuchniaPanel() {
  const today = new Date().toISOString().split('T')[0];
  const supabase = await createSupabaseServer();

  const { data: orderItems, error } = await supabase
    .from('order_items')
    .select(`
      quantity,
      menu_items ( name ),
      orders!inner ( order_date )
    `)
    .eq('orders.order_date', today);

  const summary = {};
  if (orderItems) {
    orderItems.forEach((item) => {
      const dishName = item.menu_items?.name;
      if (!dishName) return;
      summary[dishName] = (summary[dishName] || 0) + item.quantity;
    });
  }
  const summaryArray = Object.entries(summary);

  return (
    <main className="min-h-screen relative bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-6 md:p-12 font-sans text-slate-100 overflow-hidden">
      {/* Ciemne, animowane tła ("płomienie" dla kuchni) */}
      <div className="absolute top-0 -left-20 w-96 h-96 bg-orange-600/20 rounded-full mix-blend-screen filter blur-[100px] animate-blob" />
      <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-red-600/10 rounded-full mix-blend-screen filter blur-[120px] animate-blob" style={{ animationDelay: '3s' }} />

      <div className="max-w-3xl mx-auto relative z-10 animate-fade-in">
        <header className="glass-dark p-8 rounded-3xl mb-8 border border-slate-700/50 shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl font-heading font-black mb-2 text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-red-500 flex items-center gap-3">
              <span className="text-4xl drop-shadow-[0_0_15px_rgba(249,115,22,0.5)]">👨‍🍳</span> Panel Kuchni
            </h1>
            <p className="text-slate-400 text-lg font-medium">
              Realizacja na dzień:{' '}
              <span className="text-orange-400 font-black tracking-wider">{today}</span>
            </p>
          </div>
          <div className="flex items-center gap-2 bg-slate-800/50 px-4 py-2 rounded-xl border border-slate-700/50">
            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.5)]" />
            <span className="text-sm font-bold text-slate-300 uppercase tracking-widest">Live</span>
          </div>
        </header>

        {error && (
          <p className="text-red-400 bg-red-950/50 p-4 rounded-xl border border-red-500/30 mb-8 font-medium shadow-lg backdrop-blur-sm">
            ❌ Błąd pobierania danych: {error.message}
          </p>
        )}

        <div className="glass-dark rounded-3xl shadow-2xl overflow-hidden border border-slate-700/50 animate-slide-up">
          <div className="bg-slate-800/80 px-8 py-5 border-b border-slate-700/50 flex justify-between font-bold text-slate-400 uppercase tracking-widest text-xs">
            <span>Nazwa Dania</span>
            <span>Do przygotowania</span>
          </div>

          {summaryArray.length === 0 ? (
            <div className="p-16 text-center text-slate-500 text-xl font-medium flex flex-col items-center gap-4">
              <span className="text-6xl opacity-50">☕</span>
              <p>Brak zamówień na dzisiaj. Kucharze odpoczywają!</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-700/50">
              {summaryArray.map(([dishName, quantity], index) => (
                <li
                  key={dishName}
                  className="px-8 py-6 flex justify-between items-center hover:bg-white/5 transition-colors duration-300 animate-slide-up"
                  style={{ animationDelay: `${index * 0.05}s` }}
                >
                  <span className="text-2xl font-bold text-slate-200 tracking-wide">{dishName}</span>
                  <div className="flex items-center">
                    <span className="text-4xl font-heading font-black text-orange-400 drop-shadow-[0_0_15px_rgba(249,115,22,0.4)] bg-slate-900/50 px-6 py-3 rounded-2xl border border-orange-500/20">
                      {quantity} <span className="text-xl text-orange-500/70 font-bold ml-1">szt.</span>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-10 text-center text-slate-500 text-sm font-medium tracking-wide">
          <p>Odśwież stronę, aby pobrać najnowsze zamówienia.</p>
        </div>
      </div>
    </main>
  );
}

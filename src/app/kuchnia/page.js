"use client";
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';

export default function KuchniaPanel() {
  const [shift1, setShift1] = useState({});
  const [shift2, setShift2] = useState({});
  const [loading, setLoading] = useState(true);
  const [today, setToday] = useState('');
  const [countdown, setCountdown] = useState(60);

  const fetchData = useCallback(async () => {
    const todayStr = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw' }).format(new Date());
    setToday(todayStr);
    setLoading(true);

    const { data, error } = await supabase
      .from('order_items')
      .select(`
        quantity,
        menu_items ( name ),
        orders!inner ( delivery_date, shift, status )
      `)
      .eq('orders.delivery_date', todayStr)
      .in('orders.status', ['approved', 'paid_via_blik']);

    if (error) {
      console.error('kuchnia fetch error', error);
      setLoading(false);
      return;
    }

    const s1 = {};
    const s2 = {};
    if (data) {
      data.forEach((item) => {
        const name = item.menu_items?.name;
        if (!name) return;
        const shift = item.orders?.shift;
        const target = shift === 1 ? s1 : s2;
        target[name] = (target[name] || 0) + item.quantity;
      });
    }

    setShift1(s1);
    setShift2(s2);
    setCountdown(60);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const id = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          fetchData();
          return 60;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [fetchData]);

  const s1Entries = Object.entries(shift1);
  const s2Entries = Object.entries(shift2);
  const s1Total = s1Entries.reduce((s, [, q]) => s + q, 0);
  const s2Total = s2Entries.reduce((s, [, q]) => s + q, 0);

  return (
    <main className="min-h-screen relative bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-6 md:p-12 font-sans text-slate-100 overflow-hidden">
      <div className="absolute top-0 -left-20 w-96 h-96 bg-orange-600/20 rounded-full mix-blend-screen filter blur-[100px] animate-blob" />
      <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-red-600/10 rounded-full mix-blend-screen filter blur-[120px] animate-blob" style={{ animationDelay: '3s' }} />

      <div className="max-w-5xl mx-auto relative z-10 animate-fade-in">
        <header className="glass-dark p-6 md:p-8 rounded-3xl mb-8 border border-slate-700/50 shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-heading font-black mb-2 text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-red-500 flex items-center gap-3">
              <span className="drop-shadow-[0_0_15px_rgba(249,115,22,0.5)]">👨‍🍳</span> Panel Kuchni
            </h1>
            <p className="text-slate-400 text-lg font-medium">
              Realizacja na dzień:{' '}
              <span className="text-orange-400 font-black tracking-wider">{today}</span>
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-center bg-slate-800/60 px-4 py-3 rounded-2xl border border-slate-700/50">
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">Auto-odświeżenie</p>
              <p className="text-2xl font-black text-orange-400">{countdown}s</p>
            </div>
            <button
              onClick={fetchData}
              disabled={loading}
              className="bg-orange-500 hover:bg-orange-600 text-white font-black px-6 py-4 rounded-2xl transition-all shadow-lg hover:-translate-y-0.5 disabled:opacity-50 disabled:transform-none"
            >
              {loading ? '...' : 'Odśwież'}
            </button>
          </div>
        </header>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-orange-400" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* ZMIANA I */}
            <div className="glass-dark rounded-3xl border border-orange-500/30 overflow-hidden shadow-2xl">
              <div className="bg-orange-500/20 px-6 py-5 border-b border-orange-500/20 flex justify-between items-center">
                <h2 className="font-heading font-black text-orange-400 text-xl uppercase tracking-wide">
                  I Zmiana
                </h2>
                <span className="bg-orange-500/30 text-orange-300 font-black px-4 py-1.5 rounded-xl text-sm">
                  {s1Total} szt. łącznie
                </span>
              </div>
              {s1Entries.length === 0 ? (
                <div className="p-16 text-center text-slate-500 flex flex-col items-center gap-3">
                  <span className="text-5xl opacity-40">☕</span>
                  <p className="font-medium">Brak zamówień na I zmianę</p>
                </div>
              ) : (
                <ul className="divide-y divide-slate-700/50">
                  {s1Entries.map(([name, qty]) => (
                    <li key={name} className="px-6 py-5 flex justify-between items-center hover:bg-white/5 transition-colors">
                      <span className="text-xl font-bold text-slate-200 leading-tight">{name}</span>
                      <span className="text-3xl font-heading font-black text-orange-400 drop-shadow-[0_0_10px_rgba(249,115,22,0.3)] bg-slate-900/50 px-5 py-2 rounded-2xl border border-orange-500/20 shrink-0">
                        {qty} <span className="text-base text-orange-500/70 font-bold">szt.</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* ZMIANA II */}
            <div className="glass-dark rounded-3xl border border-indigo-500/30 overflow-hidden shadow-2xl">
              <div className="bg-indigo-500/20 px-6 py-5 border-b border-indigo-500/20 flex justify-between items-center">
                <h2 className="font-heading font-black text-indigo-400 text-xl uppercase tracking-wide">
                  II Zmiana
                </h2>
                <span className="bg-indigo-500/30 text-indigo-300 font-black px-4 py-1.5 rounded-xl text-sm">
                  {s2Total} szt. łącznie
                </span>
              </div>
              {s2Entries.length === 0 ? (
                <div className="p-16 text-center text-slate-500 flex flex-col items-center gap-3">
                  <span className="text-5xl opacity-40">☕</span>
                  <p className="font-medium">Brak zamówień na II zmianę</p>
                </div>
              ) : (
                <ul className="divide-y divide-slate-700/50">
                  {s2Entries.map(([name, qty]) => (
                    <li key={name} className="px-6 py-5 flex justify-between items-center hover:bg-white/5 transition-colors">
                      <span className="text-xl font-bold text-slate-200 leading-tight">{name}</span>
                      <span className="text-3xl font-heading font-black text-indigo-400 drop-shadow-[0_0_10px_rgba(99,102,241,0.3)] bg-slate-900/50 px-5 py-2 rounded-2xl border border-indigo-500/20 shrink-0">
                        {qty} <span className="text-base text-indigo-500/70 font-bold">szt.</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

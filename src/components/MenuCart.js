"use client";
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function MenuCart({ userProfile, userId }) {
  const [allItems, setAllItems] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);
  const [cart, setCart] = useState({});
  const [selectedShift, setSelectedShift] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(null); // null | { status }
  const [submitError, setSubmitError] = useState('');

  // Stany do kalendarza
  const [selectedDate, setSelectedDate] = useState('');
  const [availableDays, setAvailableDays] = useState([]);

  // 1. Generujemy dni i pobieramy menu
  useEffect(() => {
    const days = [];
    const dayNames = ['Niedz', 'Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob'];

    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      // Data w strefie Europe/Warsaw, żeby po 22:00 nie skakać na jutro.
      const localDate = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Europe/Warsaw',
      }).format(d);
      days.push({
        date: localDate,
        name: i === 0 ? 'Dziś' : dayNames[d.getDay()],
        dayNum: d.getDate(),
      });
    }
    setAvailableDays(days);
    setSelectedDate(days[0].date);

    async function fetchMenu() {
      const { data, error } = await supabase
        .from('menu_items')
        .select('id, name, price, available_date')
        .gte('available_date', days[0].date)
        .lte('available_date', days[6].date);

      if (error) {
        console.error('menu_items fetch', error);
        return;
      }
      setAllItems(data || []);
    }
    fetchMenu();
  }, []);

  // 2. Filtrujemy menu po dacie
  useEffect(() => {
    if (!selectedDate) return;
    setFilteredItems(allItems.filter((item) => item.available_date === selectedDate));
    setCart({});
    setSubmitError('');
    setOrderSuccess(null);
  }, [selectedDate, allItems]);

  // Klucze koszyka trzymamy jako STRING — żeby działało dla id typu uuid i bigint.
  const addToCart = (id) =>
    setCart((prev) => ({ ...prev, [String(id)]: (prev[String(id)] || 0) + 1 }));

  const removeFromCart = (id) => {
    setCart((prev) => {
      const key = String(id);
      const next = { ...prev };
      if (next[key] > 1) next[key] -= 1;
      else delete next[key];
      return next;
    });
  };

  // UI: orientacyjny total. Wiążącą wartość liczy RPC w bazie.
  const totalAmount = filteredItems.reduce(
    (sum, item) => sum + item.price * (cart[String(item.id)] || 0),
    0
  );
  const subsidy = userProfile?.companies?.daily_subsidy || 0;
  const toPay = Math.max(totalAmount - subsidy, 0);

  const submitOrder = async () => {
    setIsSubmitting(true);
    setSubmitError('');
    setOrderSuccess(null);
    try {
      const items = Object.entries(cart).map(([itemId, quantity]) => ({
        menu_item_id: itemId,
        quantity,
      }));

      const { data: orderId, error } = await supabase.rpc('create_order', {
        p_delivery_date: selectedDate,
        p_shift: selectedShift,
        p_items: items,
      });

      if (error) throw error;

      // Pobierz status nowego zamówienia (RPC zwraca tylko id).
      const { data: created } = await supabase
        .from('orders')
        .select('status, total_price, employer_paid, employee_paid')
        .eq('id', orderId)
        .single();

      setCart({});
      setOrderSuccess(created || { status: 'approved' });
      setTimeout(() => setOrderSuccess(null), 6000);
    } catch (e) {
      setSubmitError(e.message || 'Nie udało się złożyć zamówienia.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="glass text-slate-800 rounded-[2rem] p-6 max-w-md w-full animate-fade-in" style={{ animationDelay: '0.1s' }}>
      {/* PASEK WYBORU DNIA */}
      <div className="mb-8">
        <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">
          Wybierz dzień dostawy
        </label>
        <div
          className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide -mx-2 px-2"
          style={{ msOverflowStyle: 'none', scrollbarWidth: 'none' }}
        >
          {availableDays.map((day) => {
            const isSelected = selectedDate === day.date;
            return (
              <button
                key={day.date}
                onClick={() => setSelectedDate(day.date)}
                className={`flex flex-col items-center justify-center min-w-[72px] py-4 rounded-2xl transition-all duration-300 ${
                  isSelected
                    ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/30 scale-105'
                    : 'bg-white/60 text-slate-500 hover:bg-white hover:shadow-md border border-slate-200/50 backdrop-blur-sm'
                }`}
              >
                <span
                  className={`text-[10px] font-bold uppercase mb-1.5 tracking-wider ${
                    isSelected ? 'text-blue-100' : 'text-slate-400'
                  }`}
                >
                  {day.name}
                </span>
                <span className="text-2xl font-black font-heading leading-none">{day.dayNum}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* WYBÓR ZMIANY */}
      <div className="mb-8 animate-slide-up" style={{ animationDelay: '0.2s' }}>
        <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">
          Na którą zmianę?
        </label>
        <div className="flex gap-3 p-1.5 bg-slate-200/50 rounded-2xl backdrop-blur-sm">
          {[1, 2].map((shift) => (
            <button
              key={shift}
              onClick={() => setSelectedShift(shift)}
              className={`flex-1 py-3 rounded-xl font-bold transition-all duration-300 text-sm ${
                selectedShift === shift
                  ? 'bg-white text-blue-600 shadow-md'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
              }`}
            >
              {shift} Zmiana
            </button>
          ))}
        </div>
      </div>

      <h2 className="text-xl font-heading font-black mb-5 flex items-center gap-2 text-slate-800 animate-slide-up" style={{ animationDelay: '0.3s' }}>
        <span className="bg-blue-100 text-blue-600 p-2 rounded-xl text-lg">🍽️</span> Menu na ten dzień:
      </h2>

      <div className="animate-slide-up" style={{ animationDelay: '0.4s' }}>
        {filteredItems.length === 0 ? (
          <div className="py-10 text-center bg-white/40 rounded-3xl border-2 border-dashed border-slate-300/50 backdrop-blur-sm">
            <p className="text-slate-500 font-medium">Brak dodanego menu na ten dzień.</p>
          </div>
        ) : (
          <ul className="space-y-4">
            {filteredItems.map((item) => {
              const key = String(item.id);
              const inCart = cart[key] > 0;
              return (
                <li
                  key={key}
                  className={`flex justify-between items-center p-4 rounded-2xl border transition-all duration-300 backdrop-blur-sm ${
                    inCart 
                      ? 'bg-white border-blue-200 shadow-md shadow-blue-500/5' 
                      : 'bg-white/60 border-slate-200/50 hover:bg-white hover:shadow-md'
                  }`}
                >
                  <div className="flex-1 pr-4">
                    <p className="font-bold text-slate-800 leading-tight mb-1">{item.name}</p>
                    <p className="text-indigo-600 font-black text-sm">{item.price} zł</p>
                  </div>
                  <div className="flex items-center gap-3 bg-slate-50 p-1.5 rounded-2xl border border-slate-100">
                    {inCart ? (
                      <>
                        <button
                          onClick={() => removeFromCart(item.id)}
                          className="w-8 h-8 flex items-center justify-center rounded-xl bg-white text-slate-600 shadow-sm border border-slate-200 font-bold hover:text-red-500 hover:border-red-200 transition-colors"
                        >
                          -
                        </button>
                        <span className="font-bold w-4 text-center text-slate-800">{cart[key]}</span>
                        <button
                          onClick={() => addToCart(item.id)}
                          className="w-8 h-8 flex items-center justify-center rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm font-bold hover:shadow-md transition-all"
                        >
                          +
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => addToCart(item.id)}
                        className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm font-bold text-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
                      >
                        Dodaj
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {orderSuccess && (
        <div className="mt-6 p-4 bg-green-50 border border-green-200 text-green-700 rounded-2xl text-center font-bold animate-fade-in shadow-sm">
          🎉 Zamówienie przyjęte!
          {orderSuccess.status === 'pending_payment' && (
            <div className="text-xs font-semibold mt-2 text-yellow-700 bg-yellow-100/50 py-1 px-2 rounded-lg inline-block">
              Status: oczekuje na płatność.
            </div>
          )}
          {orderSuccess.status === 'approved' && (
            <div className="text-xs font-semibold mt-2 text-green-700 bg-green-200/50 py-1 px-2 rounded-lg inline-block">
              Status: opłacone.
            </div>
          )}
        </div>
      )}

      {submitError && (
        <div className="mt-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-2xl text-center font-bold text-sm animate-fade-in shadow-sm">
          {submitError}
        </div>
      )}

      {totalAmount > 0 && (
        <div className="mt-8 pt-6 border-t border-slate-200/50 animate-slide-up" style={{ animationDelay: '0.5s' }}>
          <div className="flex justify-between items-end">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Do zapłaty:</p>
              <p className="text-4xl font-heading font-black text-transparent bg-clip-text bg-gradient-to-r from-slate-800 to-slate-600">
                {toPay.toFixed(2)} <span className="text-2xl">zł</span>
              </p>
            </div>
            <button
              onClick={submitOrder}
              disabled={isSubmitting}
              className="relative group bg-gradient-to-r from-green-500 to-emerald-600 text-white px-8 py-4 rounded-2xl font-black text-lg shadow-[0_8px_16px_-6px_rgba(16,185,129,0.5)] hover:shadow-[0_12px_20px_-6px_rgba(16,185,129,0.6)] hover:-translate-y-1 transition-all duration-300 disabled:opacity-50 disabled:transform-none disabled:shadow-none overflow-hidden"
            >
              <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
              <span className="relative">{isSubmitting ? '...' : 'ZAMÓW'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

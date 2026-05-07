"use client";
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function MenuCart({ userProfile, userId }) {
  const [allItems, setAllItems] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);
  const [cart, setCart] = useState({});
  const [selectedShift, setSelectedShift] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);
  
  // Nowe stany do kalendarza
  const [selectedDate, setSelectedDate] = useState('');
  const [availableDays, setAvailableDays] = useState([]);

  // 1. Generujemy dni i pobieramy menu przy starcie
  useEffect(() => {
    // Generowanie paska najbliższych 7 dni
    const days = [];
    const dayNames = ['Niedz', 'Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob'];
    
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      days.push({
        date: d.toISOString().split('T')[0],
        name: i === 0 ? 'Dziś' : dayNames[d.getDay()],
        dayNum: d.getDate()
      });
    }
    setAvailableDays(days);
    setSelectedDate(days[0].date); // Ustawiamy dzisiejszy dzień jako domyślny

    // Pobieranie bazy dań
    async function fetchMenu() {
      const { data } = await supabase.from('menu_items').select('*');
      setAllItems(data || []);
    }
    fetchMenu();
  }, []);

  // 2. Filtrujemy menu, gdy zmieni się kliknięty dzień
  useEffect(() => {
    if (!selectedDate) return;
    const dailyMenu = allItems.filter(item => item.available_date === selectedDate);
    setFilteredItems(dailyMenu);
    setCart({}); // Czyścimy koszyk przy zmianie dnia!
  }, [selectedDate, allItems]);

  const addToCart = (id) => setCart(prev => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
  const removeFromCart = (id) => {
    setCart(prev => {
      const newCart = { ...prev };
      if (newCart[id] > 1) newCart[id] -= 1;
      else delete newCart[id];
      return newCart;
    });
  };

  const totalAmount = filteredItems.reduce((sum, item) => sum + (item.price * (cart[item.id] || 0)), 0);
  const subsidy = userProfile?.companies?.daily_subsidy || 0;
  const toPay = Math.max(totalAmount - subsidy, 0);

  const submitOrder = async () => {
    setIsSubmitting(true);
    try {
      const { data: newOrder, error: orderError } = await supabase
        .from('orders')
        .insert([{
          profile_id: userId,
          order_date: new Date().toISOString().split('T')[0], 
          delivery_date: selectedDate, // Zapisujemy na kiedy jest posiłek
          shift: selectedShift,
          total_price: totalAmount,
          employer_paid: Math.min(totalAmount, subsidy),
          employee_paid: toPay,
          status: 'approved'
        }])
        .select().single();

      if (orderError) throw orderError;

      const orderItemsData = Object.entries(cart).map(([itemId, quantity]) => ({
        order_id: newOrder.id,
        menu_item_id: itemId,
        quantity,
        price_at_time: filteredItems.find(i => i.id === itemId).price
      }));

      await supabase.from('order_items').insert(orderItemsData);
      setCart({});
      setOrderSuccess(true);
      setTimeout(() => setOrderSuccess(false), 4000);
    } catch (e) { alert(e.message); }
    finally { setIsSubmitting(false); }
  };

  return (
    <div className="bg-white text-black shadow-xl rounded-3xl p-6 max-w-md w-full border border-slate-100">
      
      {/* NOWY PASEK WYBORU DNIA (PRZESUWANY W POZIOMIE) */}
      <div className="mb-6">
        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Wybierz dzień dostawy:</label>
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide" style={{ msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
          {availableDays.map((day) => {
            const isSelected = selectedDate === day.date;
            return (
              <button
                key={day.date}
                onClick={() => setSelectedDate(day.date)}
                className={`flex flex-col items-center justify-center min-w-[64px] py-3 rounded-2xl transition-all ${
                  isSelected 
                    ? 'bg-blue-600 text-white shadow-md scale-105' 
                    : 'bg-slate-50 text-slate-500 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                <span className={`text-xs font-bold uppercase mb-1 ${isSelected ? 'text-blue-100' : 'text-slate-400'}`}>
                  {day.name}
                </span>
                <span className="text-xl font-black">{day.dayNum}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* WYBÓR ZMIANY */}
      <div className="mb-6">
        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Na którą zmianę?</label>
        <div className="flex gap-2">
          {[1, 2].map(shift => (
            <button
              key={shift}
              onClick={() => setSelectedShift(shift)}
              className={`flex-1 py-3 rounded-xl font-bold transition ${selectedShift === shift ? 'bg-slate-800 text-white shadow-lg' : 'bg-slate-50 text-slate-400 border border-slate-200 hover:bg-slate-100'}`}
            >
              {shift} Zmiana
            </button>
          ))}
        </div>
      </div>

      <h2 className="text-xl font-black mb-4 flex items-center gap-2">
        🍴 Menu na ten dzień:
      </h2>

      {filteredItems.length === 0 ? (
        <div className="py-8 text-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
          <p className="text-slate-400 font-medium">Brak dodanego menu na ten dzień.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {filteredItems.map((item) => (
            <li key={item.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-2xl border border-slate-100">
              <div>
                <p className="font-bold text-slate-800">{item.name}</p>
                <p className="text-green-600 font-black text-sm">{item.price} zł</p>
              </div>
              <div className="flex items-center gap-2">
                {cart[item.id] > 0 && (
                  <button onClick={() => removeFromCart(item.id)} className="w-8 h-8 rounded-full bg-white text-red-500 shadow-sm border border-slate-200 font-bold text-lg leading-none">-</button>
                )}
                <span className="font-bold w-5 text-center">{cart[item.id] || 0}</span>
                <button onClick={() => addToCart(item.id)} className="w-8 h-8 rounded-full bg-blue-600 text-white shadow-sm font-bold text-lg leading-none">+</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {orderSuccess && <div className="mt-4 p-3 bg-green-100 text-green-700 rounded-xl text-center font-bold">🎉 Zamówienie przyjęte!</div>}

      {totalAmount > 0 && (
        <div className="mt-8 pt-6 border-t border-slate-100">
          <div className="flex justify-between items-end">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase">Do zapłaty:</p>
              <p className="text-3xl font-black text-slate-800">{toPay.toFixed(2)} zł</p>
            </div>
            <button 
              onClick={submitOrder} 
              disabled={isSubmitting}
              className="bg-green-500 text-white px-8 py-4 rounded-2xl font-black hover:bg-green-600 transition shadow-lg disabled:bg-slate-300 active:scale-95"
            >
              {isSubmitting ? '...' : 'ZAMÓW'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
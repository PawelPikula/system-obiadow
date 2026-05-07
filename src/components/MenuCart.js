"use client";
import { useState } from 'react';
import { supabase } from '../lib/supabase'; // <-- Podpinamy naszą bazę danych!

export default function MenuCart({ items, profiles }) {
  const [cart, setCart] = useState({});
  const [selectedUser, setSelectedUser] = useState(profiles[0]);
  
  // Nowe stany do obsługi wysyłania
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);

  const addToCart = (id) => setCart(prev => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
  
  const removeFromCart = (id) => {
    setCart(prev => {
      const newCart = { ...prev };
      if (newCart[id] > 1) newCart[id] -= 1;
      else delete newCart[id];
      return newCart;
    });
  };

  const totalAmount = items?.reduce((sum, item) => sum + (item.price * (cart[item.id] || 0)), 0);
  const totalItems = Object.values(cart).reduce((a, b) => a + b, 0);
  
  const subsidy = selectedUser?.companies?.daily_subsidy || 0;
  // Faktyczna kwota, którą płaci pracodawca (jeśli obiad jest tańszy niż dofinansowanie, pracodawca płaci tylko za obiad)
  const employerPaid = Math.min(totalAmount, subsidy);
  const toPay = Math.max(totalAmount - subsidy, 0);

  const handleUserChange = (e) => {
    const userId = e.target.value;
    setSelectedUser(profiles.find(p => p.id === userId));
    setCart({}); 
    setOrderSuccess(false); // Ukrywamy komunikat o sukcesie przy zmianie osoby
  };

  // --- FUNKCJA ZAPISUJĄCA W BAZIE DANYCH ---
  const submitOrder = async () => {
    setIsSubmitting(true);
    try {
      // 1. Zapisujemy główny rekord zamówienia
      const { data: newOrder, error: orderError } = await supabase
        .from('orders')
        .insert([{
          profile_id: selectedUser.id,
          order_date: new Date().toISOString().split('T')[0], // Dzisiejsza data
          total_price: totalAmount,
          employer_paid: employerPaid,
          employee_paid: toPay,
          status: selectedUser.companies.payment_model === 'blik' ? 'pending_payment' : 'approved'
        }])
        .select()
        .single(); // Zwraca nam ID utworzonego zamówienia

      if (orderError) throw orderError;

      // 2. Szykujemy listę konkretnych dań z koszyka
      const orderItemsData = Object.entries(cart).map(([itemId, quantity]) => {
        const itemInfo = items.find(i => i.id === itemId);
        return {
          order_id: newOrder.id,
          menu_item_id: itemId,
          quantity: quantity,
          price_at_time: itemInfo.price
        };
      });

      // 3. Zapisujemy dania do bazy
      const { error: itemsError } = await supabase.from('order_items').insert(orderItemsData);
      
      if (itemsError) throw itemsError;

      // 4. Jeśli wszystko się udało: czyścimy koszyk i pokazujemy sukces
      setCart({});
      setOrderSuccess(true);
      setTimeout(() => setOrderSuccess(false), 4000); // Ukryj zielony pasek po 4 sekundach

    } catch (error) {
      alert("Błąd podczas zapisywania: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white text-black shadow-md rounded-xl p-6 max-w-md w-full relative">
      
      {/* Panel wyboru pracownika */}
      <div className="mb-6 p-4 bg-blue-50 border border-blue-100 rounded-lg">
        <label className="block text-sm font-semibold text-blue-800 mb-2">Symulacja pracownika:</label>
        <select 
          className="w-full p-2 border border-blue-300 rounded-md bg-white text-black"
          value={selectedUser?.id}
          onChange={handleUserChange}
        >
          {profiles?.map(user => (
            <option key={user.id} value={user.id}>
              {user.first_name} {user.last_name} ({user.companies?.name})
            </option>
          ))}
        </select>
        
        <div className="mt-2 text-sm text-gray-700 flex justify-between">
          <span>Model: <strong className="uppercase">{selectedUser?.companies?.payment_model}</strong></span>
          <span>Dofinansowanie: <strong className="text-green-600">{subsidy} zł</strong></span>
        </div>
      </div>

      <h2 className="text-xl font-semibold mb-4 border-b pb-2">Menu na dziś:</h2>
      <ul>
        {items?.map((item) => (
          <li key={item.id} className="flex flex-col py-3 border-b border-gray-200 last:border-0">
            <div className="flex justify-between items-center mb-3">
              <span className="font-medium">{item.name}</span>
              <span className="font-bold text-green-600">{item.price} zł</span>
            </div>
            
            <div className="flex justify-end items-center gap-3">
              {cart[item.id] > 0 && (
                <>
                  <button onClick={() => removeFromCart(item.id)} className="bg-red-100 text-red-600 w-8 h-8 rounded-full font-bold text-lg flex items-center justify-center hover:bg-red-200">-</button>
                  <span className="font-semibold w-4 text-center">{cart[item.id]}</span>
                </>
              )}
              <button 
                onClick={() => addToCart(item.id)} 
                className="bg-blue-600 text-white px-5 py-1.5 rounded-full text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-50"
                disabled={isSubmitting}
              >
                {cart[item.id] > 0 ? '+' : 'Dodaj'}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {/* Komunikat sukcesu */}
      {orderSuccess && (
        <div className="mt-4 p-3 bg-green-100 text-green-800 rounded-lg text-center font-semibold border border-green-300">
          🎉 Zamówienie zostało wysłane!
        </div>
      )}

      {/* Pasek podsumowania */}
      {totalItems > 0 && !orderSuccess && (
        <div className="mt-6 bg-gray-50 border border-gray-200 p-4 rounded-xl shadow-inner">
          <div className="flex justify-between text-sm text-gray-500 mb-1">
            <span>Wartość zamówienia:</span>
            <span>{totalAmount.toFixed(2)} zł</span>
          </div>
          {subsidy > 0 && (
            <div className="flex justify-between text-sm text-green-600 font-medium mb-2 border-b pb-2">
              <span>Pokrywa pracodawca:</span>
              <span>- {employerPaid.toFixed(2)} zł</span>
            </div>
          )}
          
          <div className="flex justify-between items-center mt-2">
            <div>
              <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Do zapłaty</p>
              <p className="text-2xl font-black text-black">{toPay.toFixed(2)} zł</p>
            </div>
            <button 
              onClick={submitOrder}
              disabled={isSubmitting}
              className={`text-white px-6 py-3 rounded-xl font-bold transition shadow-md ${isSubmitting ? 'bg-gray-400' : 'bg-green-500 hover:bg-green-600'}`}
            >
              {isSubmitting ? 'Wysyłanie...' : (selectedUser?.companies?.payment_model === 'blik' ? 'Płacę BLIK' : 'Zamawiam')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
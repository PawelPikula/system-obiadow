"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';

export default function HistoriaPage() {
  const router = useRouter();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ totalEmployeePaid: 0, count: 0 });
  const [settings, setSettings] = useState(null);

  // Stany do obsługi formularza opinii
  const [reviewingItemId, setReviewingItemId] = useState(null);
  const [tempRating, setTempRating] = useState(5);
  const [tempReview, setTempReview] = useState('');

  useEffect(() => {
    fetchOrderHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchOrderHistory() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      router.replace('/login');
      return;
    }

    // Pobieramy historię wraz z nowymi polami: rating i review_text
    const { data: ordersData } = await supabase
      .from('orders')
      .select(`
        id, shift, order_date, delivery_date, total_price, employee_paid, employer_paid, status,
        order_items (
          id, quantity, rating, review_text,
          menu_items ( name )
        )
      `)
      .eq('profile_id', session.user.id)
      .order('delivery_date', { ascending: false });

    if (ordersData) {
      setOrders(ordersData);
      
      const currentMonth = new Date().getMonth();
      const currentYear = new Date().getFullYear();
      
      const monthlyTotal = ordersData
        .filter(o => {
          const d = new Date(o.delivery_date || o.order_date);
          return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
        })
        .reduce((sum, o) => sum + o.employee_paid, 0);

      setStats({ totalEmployeePaid: monthlyTotal, count: ordersData.length });
    }
    
    const { data: settingsData } = await supabase.from('system_settings').select('*').eq('id', 1).single();
    if (settingsData) setSettings(settingsData);
    
    setLoading(false);
  }

  // Sprawdzanie czy można anulować zamówienie
  const canCancelOrder = (deliveryDate, shift) => {
    if (!settings) return false;
    
    const now = new Date();
    const todayStr = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw' }).format(now);
    
    const isPrevDay = shift === 1 ? settings.cancel_cutoff_shift1_prev_day : settings.cancel_cutoff_shift2_prev_day;
    const cutoffTime = shift === 1 ? settings.cancel_cutoff_shift1 : settings.cancel_cutoff_shift2;
    
    const deliveryDateObj = new Date(deliveryDate);
    if (isPrevDay) {
      deliveryDateObj.setDate(deliveryDateObj.getDate() - 1);
    }
    const cutoffDateStr = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw' }).format(deliveryDateObj);
    
    if (cutoffDateStr > todayStr) return true;
    if (cutoffDateStr < todayStr) return false;
    
    const getHourFloat = (timeStr) => {
      if (!timeStr) return 0;
      const [h, m] = timeStr.split(':').map(Number);
      return h + (m || 0) / 60;
    };
    
    const currentHour = now.getHours() + now.getMinutes() / 60;
    if (currentHour < getHourFloat(cutoffTime)) return true;
    
    return false;
  };

  // Funkcja anulowania zamówienia
  const handleCancelOrder = async (orderId) => {
    if (!confirm('Czy na pewno chcesz anulować to zamówienie? Środki nie wrócą na Twoje konto od razu (jeśli dotyczy), skontaktuj się z administratorem jeśli to był błąd.')) return;
    
    const { error } = await supabase
      .from('orders')
      .update({ status: 'cancelled' })
      .eq('id', orderId);

    if (error) {
      toast.error('Nie udało się anulować zamówienia: ' + error.message);
    } else {
      toast.success('Zamówienie zostało pomyślnie anulowane.');
      fetchOrderHistory(); // Odświeżenie danych
    }
  };

  // Funkcja zapisująca ocenę do bazy
  async function submitReview(itemId) {
    const { error } = await supabase
      .from('order_items')
      .update({ rating: tempRating, review_text: tempReview })
      .eq('id', itemId);

    if (error) {
      toast.error('Nie udało się zapisać opinii: ' + error.message);
    } else {
      toast.success('Dzięki za opinię!');
      setReviewingItemId(null);
      fetchOrderHistory();
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-blue-500"></div>
      </div>
    );
  }

  // Data w strefie Europe/Warsaw (a nie UTC) — żeby po 22:00 nie pokazywało jutra.
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw' }).format(new Date());

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans text-slate-900">
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Twoje Zamówienia 📝</h1>
          <Link href="/" className="text-blue-600 font-semibold text-sm hover:underline">Wróć do menu</Link>
        </div>

        {/* Karta Podsumowania */}
        <div className="bg-blue-600 rounded-3xl p-6 text-white shadow-lg mb-8">
          <p className="text-blue-100 text-sm uppercase font-bold tracking-wider">Wydatki w tym miesiącu:</p>
          <h2 className="text-4xl font-black mt-1">{stats.totalEmployeePaid.toFixed(2)} zł</h2>
        </div>

        <h3 className="text-lg font-bold mb-4 text-slate-700">Historia i oceny:</h3>

        {orders.length === 0 ? (
          <div className="bg-white p-12 rounded-3xl text-center shadow-sm border border-slate-200">
            <p className="text-slate-400 font-medium">Brak zamówień.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {orders.map((order) => {
              // Sprawdzamy czy jedzenie już powinno być dostarczone (data dostawy <= dzisiaj)
              const isDelivered = (order.delivery_date || order.order_date) <= today;
              const isCancelled = order.status === 'cancelled';
              const isCancelable = !isCancelled && canCancelOrder(order.delivery_date, order.shift);

              return (
                <div key={order.id} className={`bg-white p-5 rounded-3xl shadow-sm border ${isCancelled ? 'border-red-200 opacity-75' : 'border-slate-200'} transition-all`}>
                  <div className="flex flex-col md:flex-row justify-between md:items-start mb-4 border-b border-slate-100 pb-3 gap-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded text-white ${order.shift === 1 ? 'bg-orange-500' : 'bg-indigo-500'}`}>
                          ZM {order.shift}
                        </span>
                        {isCancelled && <span className="text-[10px] font-bold px-2 py-0.5 rounded text-white bg-red-500">ANULOWANE</span>}
                      </div>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                        Dostawa: <span className={isCancelled ? "text-slate-400 line-through" : "text-slate-700"}>{order.delivery_date || order.order_date}</span>
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <p className={`text-xl font-black ${isCancelled ? "text-slate-400 line-through" : ""}`}>{order.employee_paid.toFixed(2)} zł</p>
                      {isCancelable && (
                        <button 
                          onClick={() => handleCancelOrder(order.id)}
                          className="text-xs font-bold text-red-500 bg-red-50 border border-red-200 px-3 py-1 rounded-lg hover:bg-red-100 transition-colors shadow-sm"
                        >
                          Anuluj Zamówienie
                        </button>
                      )}
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    {order.order_items.map((item) => (
                      <div key={item.id} className="flex flex-col bg-slate-50 p-4 rounded-2xl">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-slate-800">
                            {item.quantity}x {item.menu_items.name}
                          </span>
                          
                          {/* Logika oceniania */}
                          {isCancelled ? (
                            <span className="text-xs text-red-400 font-semibold italic">Zamówienie anulowane</span>
                          ) : item.rating ? (
                            // Jeśli oceniono, pokazujemy gwiazdki
                            <div className="flex items-center gap-2 text-yellow-500">
                              <span className="font-black">{item.rating}/5 ⭐</span>
                              {item.review_text && <span className="text-xs text-slate-500 italic font-medium truncate max-w-[100px]">"{item.review_text}"</span>}
                            </div>
                          ) : isDelivered ? (
                            // Jeśli dostarczono, ale brak oceny - przycisk do ocenienia
                            <button 
                              onClick={() => {
                                setReviewingItemId(item.id);
                                setTempRating(5);
                                setTempReview('');
                              }}
                              className="text-xs font-bold bg-white border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition shadow-sm"
                            >
                              Oceń danie ⭐
                            </button>
                          ) : (
                            // Jeśli jeszcze nie dostarczono
                            <span className="text-xs text-slate-400 font-semibold italic">Oczekuje na dostawę</span>
                          )}
                        </div>

                        {/* Otwarty formularz oceniania dla konkretnego dania */}
                        {reviewingItemId === item.id && (
                          <div className="mt-4 pt-4 border-t border-slate-200 animate-in fade-in slide-in-from-top-2">
                            <label className="block text-xs font-bold text-slate-500 mb-2">Twoja ocena:</label>
                            <div className="flex gap-1 mb-3">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                  key={star}
                                  onClick={() => setTempRating(star)}
                                  className={`text-2xl transition-transform hover:scale-110 ${star <= tempRating ? 'text-yellow-400' : 'text-slate-300 grayscale'}`}
                                >
                                  ⭐
                                </button>
                              ))}
                            </div>
                            
                            <input 
                              type="text" 
                              placeholder="Krótki komentarz (opcjonalnie)..." 
                              value={tempReview}
                              onChange={(e) => setTempReview(e.target.value)}
                              className="w-full p-2 text-sm border border-slate-200 rounded-lg mb-3 outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            
                            <div className="flex gap-2">
                              <button onClick={() => submitReview(item.id)} className="bg-black text-white text-xs font-bold px-4 py-2 rounded-lg hover:bg-slate-800 transition">Zapisz opinię</button>
                              <button onClick={() => setReviewingItemId(null)} className="bg-slate-200 text-slate-600 text-xs font-bold px-4 py-2 rounded-lg hover:bg-slate-300 transition">Anuluj</button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
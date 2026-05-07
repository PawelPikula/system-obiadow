"use client";
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
export default function HistoriaPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ totalEmployeePaid: 0, count: 0 });

  useEffect(() => {
    fetchOrderHistory();
  }, []);

  async function fetchOrderHistory() {
    // 1. Pobierz sesję
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      window.location.href = '/login';
      return;
    }

    // 2. Pobierz zamówienia wraz z ich zawartością (join menu_items)
    const { data: ordersData, error } = await supabase
      .from('orders')
      .select(`
        id,
        order_date,
        total_price,
        employee_paid,
        employer_paid,
        status,
        order_items (
          quantity,
          menu_items ( name )
        )
      `)
      .eq('profile_id', session.user.id)
      .order('order_date', { ascending: false });

    if (ordersData) {
      setOrders(ordersData);
      
      // Oblicz statystyki dla bieżącego miesiąca
      const currentMonth = new Date().getMonth();
      const currentYear = new Date().getFullYear();
      
      const monthlyTotal = ordersData
        .filter(o => {
          const d = new Date(o.order_date);
          return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
        })
        .reduce((sum, o) => sum + o.employee_paid, 0);

      setStats({ totalEmployeePaid: monthlyTotal, count: ordersData.length });
    }
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans text-slate-900">
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Twoje Zamówienia 📝</h1>
          <a href="/" className="text-blue-600 font-semibold text-sm">Wróć do menu</a>
        </div>

        {/* Karta Podsumowania */}
        <div className="bg-blue-600 rounded-2xl p-6 text-white shadow-lg mb-8">
          <p className="text-blue-100 text-sm uppercase font-bold tracking-wider">Do potrącenia w tym miesiącu:</p>
          <h2 className="text-4xl font-black mt-1">{stats.totalEmployeePaid.toFixed(2)} zł</h2>
          <p className="text-blue-100 text-xs mt-2 italic">* Kwota po uwzględnieniu dofinansowania firmy</p>
        </div>

        <h3 className="text-lg font-bold mb-4 text-slate-700">Ostatnie zamówienia:</h3>

        {orders.length === 0 ? (
          <div className="bg-white p-12 rounded-2xl text-center shadow-sm border border-slate-200">
            <p className="text-slate-400 font-medium">Nie masz jeszcze żadnych zamówień.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {orders.map((order) => (
              <div key={order.id} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <p className="text-sm font-bold text-slate-400 uppercase">{order.order_date}</p>
                    <div className="mt-1">
                      {order.order_items.map((item, idx) => (
                        <span key={idx} className="block text-slate-800 font-medium">
                          {item.quantity}x {item.menu_items.name}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`text-[10px] font-bold px-2 py-1 rounded uppercase ${
                      order.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                    }`}>
                      {order.status === 'paid_via_blik' ? 'Opłacone BLIK' : 'Na listę płac'}
                    </span>
                    <p className="text-xl font-black mt-2">{order.employee_paid.toFixed(2)} zł</p>
                  </div>
                </div>
                
                <div className="pt-3 border-t border-slate-50 flex justify-between text-xs text-slate-400">
                  <span>Wartość posiłku: {order.total_price.toFixed(2)} zł</span>
                  <span>Firma pokryła: {order.employer_paid.toFixed(2)} zł</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
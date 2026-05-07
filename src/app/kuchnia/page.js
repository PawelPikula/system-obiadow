export const dynamic = 'force-dynamic'; // Wymusza pobieranie świeżych danych przy każdym odświeżeniu!
import { supabase } from '../../lib/supabase';

export default async function KuchniaPanel() {
  // 1. Pobieramy dzisiejszą datę w formacie YYYY-MM-DD
  const today = new Date().toISOString().split('T')[0];

  // 2. Wyciągamy zamówione dania tylko z dzisiejszych zamówień
  // Używamy magii Supabase (tzw. inner join), żeby od razu pobrać nazwy dań i datę z tabeli orders
  const { data: orderItems, error } = await supabase
    .from('order_items')
    .select(`
      quantity,
      menu_items ( name ),
      orders!inner ( order_date )
    `)
    .eq('orders.order_date', today);

  // 3. Agregacja (sumowanie) dań
  const summary = {};
  if (orderItems) {
    orderItems.forEach(item => {
      const dishName = item.menu_items.name;
      // Jeśli danie już jest na liście, dodaj do niego ilość. Jeśli nie, stwórz je z tą ilością.
      summary[dishName] = (summary[dishName] || 0) + item.quantity;
    });
  }

  // Zamieniamy obiekt { "Schabowy": 2, "Pierogi": 1 } na łatwą do wyświetlenia tablicę
  const summaryArray = Object.entries(summary);

  return (
    <main className="p-6 md:p-12 font-sans min-h-screen bg-slate-900 text-white">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-4xl font-bold mb-2 text-orange-400">Panel Kuchni 👨‍🍳</h1>
        <p className="text-gray-400 mb-8 text-lg">Raport zamówień na dzień: <span className="text-white font-semibold">{today}</span></p>
        
        {error && (
          <p className="text-red-500 bg-red-100/10 p-4 rounded-lg border border-red-500/50 mb-6">
            Błąd pobierania danych: {error.message}
          </p>
        )}

        <div className="bg-slate-800 rounded-2xl shadow-2xl overflow-hidden border border-slate-700">
          <div className="bg-slate-700 px-6 py-4 border-b border-slate-600 flex justify-between font-semibold text-slate-300 uppercase tracking-wider text-sm">
            <span>Nazwa Dania</span>
            <span>Do przygotowania</span>
          </div>
          
          {summaryArray.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xl font-medium">
              Brak zamówień na dzisiaj. Kucharze odpoczywają! ☕
            </div>
          ) : (
            <ul className="divide-y divide-slate-700">
              {summaryArray.map(([dishName, quantity], index) => (
                <li key={index} className="px-6 py-6 flex justify-between items-center hover:bg-slate-750 transition duration-150">
                  <span className="text-2xl font-medium text-slate-100">{dishName}</span>
                  <span className="text-3xl font-black text-orange-500 bg-orange-500/10 px-5 py-2 rounded-xl border border-orange-500/20 shadow-inner">
                    {quantity} szt.
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        
        <div className="mt-8 text-center text-slate-500 text-sm flex flex-col items-center gap-2">
          <p>Odśwież stronę, aby pobrać najnowsze zamówienia.</p>
          <button 
            // Ten mały trik ładuje stronę ponownie po kliknięciu
            className="text-orange-400 hover:text-orange-300 underline font-medium"
          >
            Odśwież dane
          </button>
        </div>
      </div>
    </main>
  );
}
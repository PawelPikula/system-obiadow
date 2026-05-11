"use client";
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';

export default function RestauracjaPanel() {
  const [activeTab, setActiveTab] = useState('menu'); 
  const [printMode, setPrintMode] = useState('report'); // 'report' lub 'stickers'
  
  // Dane z bazy
  const [allItems, setAllItems] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  // Kalendarz
  const [selectedDate, setSelectedDate] = useState('');
  const [availableDays, setAvailableDays] = useState([]);

  // Dane do produkcji
  const [shift1Summary, setShift1Summary] = useState({});
  const [shift2Summary, setShift2Summary] = useState({});
  const [detailedOrders, setDetailedOrders] = useState([]); 

  // Formularz i autouzupełnianie
  const [dishDictionary, setDishDictionary] = useState([]);
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const wrapperRef = useRef(null);

  // 1. Inicjalizacja przy starcie
  useEffect(() => {
    const days = [];
    const dayNames = ['Niedz', 'Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob'];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      // Data w strefie Europe/Warsaw — eliminuje skok dnia o 22:00 UTC.
      const localDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw' }).format(d);
      days.push({
        date: localDate,
        name: i === 0 ? 'Dziś' : dayNames[d.getDay()],
        dayNum: d.getDate(),
      });
    }
    setAvailableDays(days);
    setSelectedDate(days[0].date);
    
    fetchRestaurantData();

    // Zamknięcie podpowiedzi po kliknięciu obok
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setShowSuggestions(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 2. Odświeżanie produkcji przy zmianie dnia
  useEffect(() => {
    if (selectedDate) fetchProduction();
  }, [selectedDate]);

  // Pobieranie menu i opinii
  async function fetchRestaurantData() {
    const { data: menuData } = await supabase.from('menu_items').select('*');
    if (menuData) {
      setAllItems(menuData);
      const unique = [];
      const seen = new Set();
      [...menuData].reverse().forEach(dish => {
        const norm = dish.name.trim().toLowerCase();
        if (!seen.has(norm)) { seen.add(norm); unique.push({ name: dish.name.trim(), price: dish.price }); }
      });
      setDishDictionary(unique);
    }

    const { data: reviewsData } = await supabase
      .from('order_items')
      .select(`id, rating, review_text, menu_items ( name ), orders ( profiles ( first_name, last_name ) )`)
      .not('rating', 'is', null)
      .order('id', { ascending: false }).limit(20);

    setReviews(reviewsData || []);
    setLoading(false);
  }

  // Pobieranie produkcji na dany dzień
  async function fetchProduction() {
    const { data } = await supabase
      .from('orders')
      .select(`
        shift,
        profiles ( first_name, last_name, companies ( name ) ),
        order_items ( quantity, menu_items ( name ) )
      `)
      .eq('delivery_date', selectedDate)
      .in('status', ['approved', 'paid_via_blik']);

    const s1 = {}; const s2 = {};
    const detailedList = [];
      
    if (data) {
      data.forEach(order => {
        const target = order.shift === 1 ? s1 : s2;
        const personName = `${order.profiles?.first_name} ${order.profiles?.last_name}`;
        const companyName = order.profiles?.companies?.name || 'Indywidualny';

        order.order_items.forEach(item => {
          const dishName = item.menu_items.name;
          const qty = item.quantity;
          
          target[dishName] = (target[dishName] || 0) + qty;

          for(let i=0; i < qty; i++) {
            detailedList.push({
              shift: order.shift,
              person: personName,
              company: companyName,
              dish: dishName
            });
          }
        });
      });
    }
    
    setShift1Summary(s1);
    setShift2Summary(s2);
    detailedList.sort((a, b) => a.shift - b.shift || a.company.localeCompare(b.company));
    setDetailedOrders(detailedList);
  }

  // Funkcje obsługi formularza (Których wcześniej zabrakło!)
  const handleNameChange = (e) => {
    const val = e.target.value;
    setNewName(val);
    if (val.length > 0) {
      setSuggestions(dishDictionary.filter(d => d.name.toLowerCase().includes(val.toLowerCase())));
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
    }
  };

  const handleSuggestionSelect = (dish) => {
    setNewName(dish.name); 
    setNewPrice(dish.price); 
    setShowSuggestions(false);
  };

  async function handleAddDish(e) {
    e.preventDefault();
    const { error } = await supabase.from('menu_items').insert([{ 
      name: newName, 
      price: parseFloat(newPrice), 
      available_date: selectedDate 
    }]);

    if (!error) {
      toast.success('Danie dodane do menu.');
      setNewName('');
      setNewPrice('');
      fetchRestaurantData();
    } else {
      toast.error('Nie udało się dodać dania: ' + error.message);
    }
  }

  async function handleDeleteDish(id) {
    const { error } = await supabase.from('menu_items').delete().eq('id', id);
    if (error) {
      toast.error('Nie udało się usunąć dania: ' + error.message);
    } else {
      toast.success('Danie usunięte.');
      fetchRestaurantData();
    }
  }

  // Uruchamianie drukowania z odpowiednim układem
  const handlePrint = (mode) => {
    setPrintMode(mode);
    setTimeout(() => {
      window.print();
    }, 100);
  };

  const dailyMenu = allItems.filter(item => item.available_date === selectedDate);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-100">Wczytywanie...</div>;

  return (
    <main className="min-h-screen relative bg-gradient-premium p-4 md:p-8 font-sans print:bg-white print:p-0 text-slate-800 overflow-hidden">
      {/* Animowane tła (blobs) - ukryte przy druku */}
      <div className="absolute top-0 -left-10 w-96 h-96 bg-blue-300 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob print:hidden" />
      <div className="absolute top-20 -right-10 w-96 h-96 bg-orange-300 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob print:hidden" style={{ animationDelay: '2s' }} />
      <div className="absolute -bottom-20 left-1/2 w-96 h-96 bg-yellow-300 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob print:hidden" style={{ animationDelay: '4s' }} />

      <div className="max-w-6xl mx-auto relative z-10 print:max-w-none print:m-0 animate-fade-in">
        
        {/* ========================================= */}
        {/* WIDOK DO DRUKU 1: RAPORT DLA KUCHNI       */}
        {/* ========================================= */}
        {printMode === 'report' && (
          <div className="hidden print:block font-serif text-black">
            <div className="text-center border-b-4 border-black pb-4 mb-8">
              <h1 className="text-4xl font-black uppercase tracking-tighter">Zestawienie Produkcyjne Kuchni</h1>
              <p className="text-xl mt-2 font-bold">Data realizacji: {selectedDate}</p>
            </div>

            <div className="grid grid-cols-2 gap-10">
              <div>
                <h2 className="text-2xl font-black border-b-2 border-black mb-4 pb-1 uppercase">I ZMIANA</h2>
                {Object.keys(shift1Summary).length === 0 ? <p className="italic text-slate-500">Brak zamówień</p> : (
                  <table className="w-full text-left">
                    <thead className="border-b border-black">
                      <tr><th className="py-2">Danie</th><th className="py-2 text-right">Ilość</th></tr>
                    </thead>
                    <tbody>
                      {Object.entries(shift1Summary).map(([name, qty]) => (
                        <tr key={name} className="border-b border-slate-200">
                          <td className="py-3 font-bold text-lg">{name}</td>
                          <td className="py-3 text-right text-2xl font-black">{qty} szt.</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div>
                <h2 className="text-2xl font-black border-b-2 border-black mb-4 pb-1 uppercase">II ZMIANA</h2>
                {Object.keys(shift2Summary).length === 0 ? <p className="italic text-slate-500">Brak zamówień</p> : (
                  <table className="w-full text-left">
                    <thead className="border-b border-black">
                      <tr><th className="py-2">Danie</th><th className="py-2 text-right">Ilość</th></tr>
                    </thead>
                    <tbody>
                      {Object.entries(shift2Summary).map(([name, qty]) => (
                        <tr key={name} className="border-b border-slate-200">
                          <td className="py-3 font-bold text-lg">{name}</td>
                          <td className="py-3 text-right text-2xl font-black">{qty} szt.</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
            
            <div className="mt-20 pt-4 border-t border-slate-300 text-xs text-center text-slate-400">
              Dokument wygenerowany automatycznie przez system zamówień B2B.
            </div>
          </div>
        )}

        {/* ========================================= */}
        {/* WIDOK DO DRUKU 2: NAKLEJKI 70x37mm        */}
        {/* ========================================= */}
        {printMode === 'stickers' && (
          <div className="hidden print:block text-black">
            <style>{`
              @page { size: A4; margin: 0; }
              .stickers-grid {
                display: grid;
                grid-template-columns: repeat(3, 70mm);
                grid-auto-rows: 37mm;
                width: 210mm;
                margin: 0 auto;
              }
              .sticker {
                width: 70mm;
                height: 37mm;
                padding: 3mm;
                box-sizing: border-box;
                border: 1px dashed #ccc; /* Pomaga przy cięciu jeśli papier nie jest nacięty */
                overflow: hidden;
                display: flex;
                flex-direction: column;
                justify-content: center;
                text-align: center;
              }
            `}</style>
            <div className="stickers-grid">
              {detailedOrders.map((order, idx) => (
                <div key={idx} className="sticker font-sans">
                  <p style={{ fontSize: '11pt', fontWeight: 'bold', margin: 0, lineHeight: 1 }}>{order.person}</p>
                  <p style={{ fontSize: '8pt', color: '#555', margin: '2px 0 4px 0', borderBottom: '1px solid #eee', paddingBottom: '2px' }}>{order.company}</p>
                  <p style={{ fontSize: '12pt', fontWeight: '900', margin: '2px 0', lineHeight: 1.1 }}>{order.dish}</p>
                  <p style={{ fontSize: '9pt', fontWeight: 'bold', margin: '4px 0 0 0' }}>ZM {order.shift} • {selectedDate}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ========================================= */}
        {/* INTERFEJS EKRANOWY (Ukrywany podczas druku)*/}
        {/* ========================================= */}
        <div className="print:hidden">
          
          {/* HEADER I ZAKŁADKI */}
          <header className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4 glass p-4 md:p-6 rounded-3xl">
            <h1 className="text-2xl font-heading font-black text-slate-800 flex items-center gap-2">
              <span className="text-3xl">👨‍🍳</span> Panel Restauracji
            </h1>
            <div className="flex bg-white/50 p-1.5 rounded-2xl backdrop-blur-sm border border-slate-200/50">
              <button onClick={() => setActiveTab('menu')} className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all duration-300 ${activeTab === 'menu' ? 'bg-white shadow-md text-blue-600 scale-105' : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'}`}>📅 Planowanie Menu</button>
              <button onClick={() => setActiveTab('produkcja')} className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all duration-300 ${activeTab === 'produkcja' ? 'bg-white shadow-md text-orange-600 scale-105' : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'}`}>🔥 Produkcja & Raporty</button>
            </div>
            <Link href="/" className="bg-white/60 px-5 py-2.5 rounded-xl shadow-sm border border-slate-200/50 text-sm font-bold text-slate-600 hover:bg-white hover:shadow-md transition-all backdrop-blur-sm">Wyjście</Link>
          </header>

          {/* PASEK Z KALENDARZEM */}
          <div className="glass p-5 md:p-6 rounded-3xl mb-8 border border-slate-200/50">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 ml-1">Wybierz dzień</p>
            <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide -mx-2 px-2" style={{ msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
              {availableDays.map((day) => {
                const isSelected = selectedDate === day.date;
                return (
                  <button key={day.date} onClick={() => setSelectedDate(day.date)} className={`flex flex-col items-center justify-center min-w-[76px] py-4 rounded-2xl transition-all duration-300 ${isSelected ? (activeTab === 'menu' ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/30 scale-105' : 'bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-lg shadow-orange-500/30 scale-105') : 'bg-white/60 text-slate-500 border border-slate-200/50 hover:bg-white hover:shadow-md backdrop-blur-sm'}`}>
                    <span className={`text-[10px] font-bold uppercase mb-1.5 tracking-wider ${isSelected ? 'text-white' : 'text-slate-400'}`}>{day.name}</span>
                    <span className="text-2xl font-heading font-black leading-none">{day.dayNum}</span>
                    {allItems.some(item => item.available_date === day.date) && <div className={`w-1.5 h-1.5 rounded-full mt-2 ${isSelected ? 'bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]' : 'bg-slate-400'}`}></div>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* --- ZAKŁADKA 1: MENU --- */}
          {activeTab === 'menu' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              
              <div className="space-y-6">
                <div className="glass p-6 rounded-3xl shadow-lg border border-slate-200/50">
                  <h2 className="text-xl font-heading font-black mb-5 text-slate-800">Dodaj danie na: <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">{selectedDate}</span></h2>
                  <form onSubmit={handleAddDish} className="flex flex-col gap-4">
                    <div ref={wrapperRef} className="relative">
                      <input type="text" required value={newName} onChange={handleNameChange} onFocus={() => newName.length > 0 && setShowSuggestions(true)} placeholder="Nazwa dania..." className="w-full p-4 bg-white/60 border border-slate-200/50 rounded-2xl outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 font-medium transition-all backdrop-blur-sm" />
                      {showSuggestions && suggestions.length > 0 && (
                        <ul className="absolute z-20 w-full mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl max-h-48 overflow-y-auto">
                          {suggestions.map((s, i) => <li key={i} onClick={() => handleSuggestionSelect(s)} className="px-4 py-3 hover:bg-blue-50 cursor-pointer flex justify-between border-b border-slate-100 last:border-0 transition-colors"><span className="font-bold">{s.name}</span><span className="text-blue-600 font-black">{s.price} zł</span></li>)}
                        </ul>
                      )}
                    </div>
                    <div className="flex gap-4">
                      <input type="number" step="0.01" required value={newPrice} onChange={e => setNewPrice(e.target.value)} placeholder="Cena (zł)" className="w-1/2 p-4 bg-white/60 border border-slate-200/50 rounded-2xl outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 font-bold transition-all backdrop-blur-sm" />
                      <button type="submit" className="w-1/2 bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-black rounded-2xl hover:from-blue-700 hover:to-indigo-700 transition-all shadow-[0_4px_14px_0_rgba(79,70,229,0.39)] hover:shadow-[0_6px_20px_rgba(79,70,229,0.23)] active:scale-95">DODAJ DO MENU</button>
                    </div>
                  </form>
                </div>

                <div className="glass p-6 rounded-3xl shadow-lg border border-slate-200/50">
                  <h2 className="text-lg font-heading font-black mb-5 text-slate-800">Menu zaplanowane na ten dzień:</h2>
                  {dailyMenu.length === 0 ? <p className="text-slate-500 italic text-center py-6 bg-white/40 rounded-2xl border border-dashed border-slate-300">Brak dań.</p> : (
                    <ul className="space-y-3">
                      {dailyMenu.map(item => (
                        <li key={item.id} className="flex justify-between items-center p-4 bg-white/60 rounded-2xl border border-slate-200/50 hover:bg-white hover:shadow-md transition-all backdrop-blur-sm">
                          <div><p className="font-bold text-slate-800">{item.name}</p><p className="text-indigo-600 font-black text-sm">{item.price} zł</p></div>
                          <button onClick={() => handleDeleteDish(item.id)} className="text-red-500 font-bold text-xs bg-white px-3 py-2 rounded-xl border border-red-100 shadow-sm hover:bg-red-50 hover:border-red-200 transition-all">USUŃ</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* OPINIE Z GWIAZDKAMI */}
              <div className="glass p-6 rounded-3xl shadow-lg border border-slate-200/50">
                <h2 className="text-xl font-heading font-black mb-5 text-slate-800 flex items-center gap-2"><span>⭐</span> Ostatnie opinie</h2>
                <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-200">
                  {reviews.length === 0 ? (
                    <p className="text-slate-500 italic text-center py-6 bg-white/40 rounded-2xl border border-dashed border-slate-300">Brak opinii.</p>
                  ) : (
                    reviews.map(review => (
                      <div key={review.id} className="p-4 bg-white/60 rounded-2xl border border-slate-200/50 hover:bg-white transition-all backdrop-blur-sm shadow-sm hover:shadow-md">
                        <div className="flex justify-between mb-2"><span className="font-bold text-sm text-slate-800">{review.menu_items?.name}</span><span className="text-yellow-500 tracking-widest">{"⭐".repeat(review.rating)}</span></div>
                        {review.review_text && <p className="text-xs text-slate-700 italic bg-white/80 p-3 rounded-xl border border-slate-100">&quot;{review.review_text}&quot;</p>}
                        <p className="text-[10px] text-slate-400 text-right mt-3 font-bold uppercase tracking-widest">{review.orders?.profiles?.first_name} {review.orders?.profiles?.last_name}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>
          )}

          {/* --- ZAKŁADKA 2: PRODUKCJA --- */}
          {activeTab === 'produkcja' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              
              <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 glass p-6 rounded-3xl border border-slate-200/50">
                <h2 className="text-2xl font-heading font-black text-slate-800">Raport dnia: <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-orange-600">{selectedDate}</span></h2>
                
                {/* PRZYCISKI DRUKOWANIA */}
                <div className="flex gap-3">
                  <button onClick={() => handlePrint('report')} className="bg-slate-800 text-white px-5 py-3 rounded-xl font-bold text-sm hover:bg-slate-900 shadow-md flex items-center gap-2 transition-all hover:shadow-lg hover:-translate-y-0.5">
                    🖨️ Raport Kuchni
                  </button>
                  <button onClick={() => handlePrint('stickers')} className="bg-gradient-to-br from-orange-400 to-orange-600 text-white px-5 py-3 rounded-xl font-bold text-sm hover:from-orange-500 hover:to-orange-700 shadow-[0_4px_14px_0_rgba(249,115,22,0.39)] hover:shadow-[0_6px_20px_rgba(249,115,22,0.23)] flex items-center gap-2 transition-all hover:-translate-y-0.5">
                    🏷️ Drukuj Naklejki
                  </button>
                </div>
              </div>

              {/* Sumy dla Kucharzy */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                <div className="glass p-6 rounded-3xl shadow-lg border-t-8 border-t-orange-500 border-x border-b border-slate-200/50">
                  <h3 className="font-heading font-black uppercase mb-5 text-orange-600 tracking-wider">I Zmiana (Podsumowanie)</h3>
                  {Object.entries(shift1Summary).length === 0 ? <p className="text-slate-500 italic text-center py-4">Brak zamówień.</p> : (
                    <div className="space-y-3">
                      {Object.entries(shift1Summary).map(([name, qty]) => (
                        <div key={name} className="flex justify-between items-center py-3 border-b border-slate-200/50 last:border-0 hover:bg-white/40 px-2 rounded-lg transition-colors">
                          <span className="font-bold text-slate-800">{name}</span>
                          <span className="text-xl font-black font-heading bg-orange-100/80 text-orange-700 px-4 py-1.5 rounded-xl shadow-sm">{qty} szt.</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                <div className="glass p-6 rounded-3xl shadow-lg border-t-8 border-t-indigo-600 border-x border-b border-slate-200/50">
                  <h3 className="font-heading font-black uppercase mb-5 text-indigo-700 tracking-wider">II Zmiana (Podsumowanie)</h3>
                  {Object.entries(shift2Summary).length === 0 ? <p className="text-slate-500 italic text-center py-4">Brak zamówień.</p> : (
                    <div className="space-y-3">
                      {Object.entries(shift2Summary).map(([name, qty]) => (
                        <div key={name} className="flex justify-between items-center py-3 border-b border-slate-200/50 last:border-0 hover:bg-white/40 px-2 rounded-lg transition-colors">
                          <span className="font-bold text-slate-800">{name}</span>
                          <span className="text-xl font-black font-heading bg-indigo-100/80 text-indigo-700 px-4 py-1.5 rounded-xl shadow-sm">{qty} szt.</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Tabela do pakowania */}
              <div className="glass p-8 rounded-3xl shadow-lg border border-slate-200/50">
                <h3 className="text-xl font-heading font-black text-slate-800 mb-6">Szczegółowa lista paczek (do pakowania):</h3>
                
                {detailedOrders.length === 0 ? (
                  <div className="p-12 text-center bg-white/40 rounded-2xl border-2 border-dashed border-slate-300">
                    <p className="text-slate-500 font-medium">Brak danych do wyświetlenia.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-2xl border border-slate-200/50 shadow-sm bg-white/40">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-white/60 text-slate-600 text-xs uppercase tracking-wider border-b border-slate-200/50">
                          <th className="p-5 font-bold">Zmiana</th>
                          <th className="p-5 font-bold">Firma</th>
                          <th className="p-5 font-bold">Pracownik</th>
                          <th className="p-5 font-bold">Zamówione Danie</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200/50">
                        {detailedOrders.map((order, idx) => (
                          <tr key={idx} className="hover:bg-white/80 transition-colors">
                            <td className="p-5">
                              <span className={`font-bold px-3 py-1.5 rounded-lg text-xs tracking-wider shadow-sm ${order.shift === 1 ? 'bg-orange-100 text-orange-700 border border-orange-200' : 'bg-indigo-100 text-indigo-700 border border-indigo-200'}`}>
                                ZMIANA {order.shift}
                              </span>
                            </td>
                            <td className="p-5 font-bold text-slate-800">{order.company}</td>
                            <td className="p-5 text-slate-600 font-medium">{order.person}</td>
                            <td className="p-5 font-black text-slate-800">{order.dish}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

            </div>
          )}
        </div>
      </div>
    </main>
  );
}
"use client";
import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';

const MONTHS_PL = ['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec','Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień'];
const DAYS_SHORT = ['Pn','Wt','Śr','Cz','Pt','So','Nd'];

function getDaysWindow(offset) {
  const dayNames = ['Niedz','Pon','Wt','Śr','Czw','Pt','Sob'];
  const todayStr = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw' }).format(new Date());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + offset + i);
    const localDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw' }).format(d);
    return { date: localDate, name: localDate === todayStr ? 'Dziś' : dayNames[d.getDay()], dayNum: d.getDate() };
  });
}

function getMonthGrid(year, month) {
  const firstDay = new Date(year, month, 1).getDay();
  const startPad = firstDay === 0 ? 6 : firstDay - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return { startPad, daysInMonth };
}

function getDayDiff(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((new Date(y, m - 1, d) - today) / 86400000);
}

function DatePickerDropdown({ year, month, selectedDate, onSelectDate, onPrevMonth, onNextMonth, onPrevYear, onNextYear, pos, onClose }) {
  const { startPad, daysInMonth } = getMonthGrid(year, month);
  const containerRef = useRef(null);
  useEffect(() => {
    function handleClick() { onClose(); }
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [onClose]);
  if (typeof document === 'undefined' || !pos) return null;
  return createPortal(
    <div
      ref={containerRef}
      className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-4 w-72"
      style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
      onClick={(e) => e.stopPropagation()}
    >
        <div className="flex items-center justify-between mb-3">
          <button type="button" onClick={onPrevMonth} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors font-black text-slate-500 text-lg">‹</button>
          <span className="font-bold text-slate-800 text-sm">{MONTHS_PL[month]} {year}</span>
          <button type="button" onClick={onNextMonth} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors font-black text-slate-500 text-lg">›</button>
        </div>
        <div className="grid grid-cols-7 mb-1">
          {DAYS_SHORT.map(d => <div key={d} className="text-center text-[10px] font-bold text-slate-400 py-1">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: startPad }, (_, i) => <div key={`p${i}`} />)}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const day = i + 1;
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isSel = selectedDate === dateStr;
            return (
              <button key={day} type="button" onClick={() => onSelectDate(dateStr)}
                className={`p-1.5 text-sm rounded-xl font-bold transition-all ${isSel ? 'bg-blue-600 text-white' : 'hover:bg-slate-100 text-slate-700'}`}
              >{day}</button>
            );
          })}
        </div>
        <div className="flex items-center justify-center gap-3 mt-3 pt-3 border-t border-slate-100">
          <button type="button" onClick={onPrevYear} className="px-2 py-1 text-xs font-bold text-slate-400 hover:bg-slate-100 rounded-lg">‹ {year - 1}</button>
          <span className="text-sm font-black text-slate-700">{year}</span>
          <button type="button" onClick={onNextYear} className="px-2 py-1 text-xs font-bold text-slate-400 hover:bg-slate-100 rounded-lg">{year + 1} ›</button>
        </div>
      </div>,
    document.body
  );
}

export default function RestauracjaPanel() {
  const [activeTab, setActiveTab] = useState('menu'); 
  const [printMode, setPrintMode] = useState('report'); // 'report' lub 'stickers'
  const [printShift, setPrintShift] = useState('all'); // 'all', 1, lub 2
  
  // Dane z bazy
  const [allItems, setAllItems] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  // Kalendarz główny
  const [selectedDate, setSelectedDate] = useState('');
  const [calendarOffset, setCalendarOffset] = useState(0);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickerYear, setPickerYear] = useState(() => new Date().getFullYear());
  const [pickerMonth, setPickerMonth] = useState(() => new Date().getMonth());

  // Kalendarz kopiowania
  const [copyCalOffset, setCopyCalOffset] = useState(-6);
  const [showCopyDatePicker, setShowCopyDatePicker] = useState(false);
  const [copyPickerYear, setCopyPickerYear] = useState(() => new Date().getFullYear());
  const [copyPickerMonth, setCopyPickerMonth] = useState(() => new Date().getMonth());

  // Dane do produkcji
  const [shift1Summary, setShift1Summary] = useState({});
  const [shift2Summary, setShift2Summary] = useState({});
  const [printFilterCompany, setPrintFilterCompany] = useState('all');
  const [printFilterCanteen, setPrintFilterCanteen] = useState('all');

  const [detailedOrders, setDetailedOrders] = useState([]);
  const [activeOrders, setActiveOrders] = useState([]);
  const [cancelledOrders, setCancelledOrders] = useState([]);

  const uniquePrintCompanies = useMemo(() => {
    return [...new Set(detailedOrders.map(o => o.company))].sort();
  }, [detailedOrders]);

  const uniquePrintCanteens = useMemo(() => {
    const filtered = printFilterCompany === 'all' 
      ? detailedOrders 
      : detailedOrders.filter(o => o.company === printFilterCompany);
    return [...new Set(filtered.map(o => o.canteen).filter(Boolean))].sort();
  }, [detailedOrders, printFilterCompany]);

  const handlePrintCompanyChange = (e) => {
    setPrintFilterCompany(e.target.value);
    setPrintFilterCanteen('all');
  };

  const printFilteredDetailed = useMemo(() => {
    return detailedOrders.filter(order => {
      if (printFilterCompany !== 'all' && order.company !== printFilterCompany) return false;
      if (printFilterCanteen !== 'all' && order.canteen !== printFilterCanteen) return false;
      return true;
    });
  }, [detailedOrders, printFilterCompany, printFilterCanteen]);

  const printShift1Summary = useMemo(() => {
    const s = {};
    printFilteredDetailed.filter(o => o.shift === 1).forEach(o => {
      s[o.dish] = (s[o.dish] || 0) + 1;
    });
    return s;
  }, [printFilteredDetailed]);

  const printShift2Summary = useMemo(() => {
    const s = {};
    printFilteredDetailed.filter(o => o.shift === 2).forEach(o => {
      s[o.dish] = (s[o.dish] || 0) + 1;
    });
    return s;
  }, [printFilteredDetailed]);

  // Statystyki
  const [statsData, setStatsData] = useState({
    today: { revenue: 0, count: 0 },
    week: { revenue: 0, count: 0 },
    month: { revenue: 0, count: 0 },
    topDishes: []
  });
  const [statsLoading, setStatsLoading] = useState(false);

  // Formularz i autouzupełnianie
  const [dishDictionary, setDishDictionary] = useState([]);
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [dishSearchQuery, setDishSearchQuery] = useState('');
  const wrapperRef = useRef(null);
  const datePickerBtnRef = useRef(null);
  const copyDatePickerBtnRef = useRef(null);
  const [pickerPos, setPickerPos] = useState(null);
  const [copyPickerPos, setCopyPickerPos] = useState(null);

  // Ustawienia
  const [settings, setSettings] = useState(null);

  // Kopiowanie menu z poprzednich dni
  const [showCopyPanel, setShowCopyPanel] = useState(false);
  const [pastMenuItems, setPastMenuItems] = useState([]);
  const [copySourceDate, setCopySourceDate] = useState('');
  const [copyingAll, setCopyingAll] = useState(false);

  // 1. Inicjalizacja przy starcie
  useEffect(() => {
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw' }).format(new Date());
    setSelectedDate(today);

    fetchRestaurantData();

    // Zamknięcie podpowiedzi po kliknięciu obok
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setShowSuggestions(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 2. Odświeżanie produkcji i statystyk
  useEffect(() => {
    if (selectedDate) fetchProduction();
  }, [selectedDate]);

  useEffect(() => {
    if (activeTab === 'statystyki') {
      fetchStatistics();
    }
  }, [activeTab]);

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
    
    const { data: settingsData } = await supabase.from('system_settings').select('*').eq('id', 1).single();
    if (settingsData) setSettings(settingsData);
    
    setLoading(false);
  }

  // Pobieranie produkcji na dany dzień
  async function fetchProduction() {
    const orderSelect = `
      id,
      shift,
      created_at,
      profiles ( first_name, last_name, companies ( name ) ),
      order_items ( quantity, menu_items ( name ) )
    `;

    const [{ data }, { data: cancelledData }] = await Promise.all([
      supabase.from('orders').select(orderSelect).eq('delivery_date', selectedDate).in('status', ['approved', 'paid_via_blik']),
      supabase.from('orders').select(orderSelect).eq('delivery_date', selectedDate).eq('status', 'cancelled'),
    ]);

    const s1 = {}; const s2 = {};
    const detailedList = [];
    const activeList = [];

    if (data) {
      data.forEach(order => {
        const target = order.shift === 1 ? s1 : s2;
        const personName = `${order.profiles?.first_name} ${order.profiles?.last_name}`;
        const companyName = order.profiles?.companies?.name || 'Indywidualny';
        const dishesStr = [];

        order.order_items.forEach(item => {
          const dishName = item.menu_items.name;
          const qty = item.quantity;
          target[dishName] = (target[dishName] || 0) + qty;
          dishesStr.push(`${qty}x ${dishName}`);
          for (let i = 0; i < qty; i++) {
            detailedList.push({ shift: order.shift, person: personName, company: companyName, canteen: '', dish: dishName });
          }
        });

        activeList.push({
          id: order.id,
          shift: order.shift,
          person: personName,
          company: companyName,
          canteen: '',
          dishes: dishesStr.join(', '),
          createdAt: new Date(order.created_at).toLocaleString('pl-PL'),
        });
      });
    }

    const cancelledList = [];
    if (cancelledData) {
      cancelledData.forEach(order => {
        const personName = `${order.profiles?.first_name} ${order.profiles?.last_name}`;
        const companyName = order.profiles?.companies?.name || 'Indywidualny';
        const dishesStr = order.order_items.map(item => `${item.quantity}x ${item.menu_items.name}`).join(', ');

        cancelledList.push({
          id: order.id,
          shift: order.shift,
          person: personName,
          company: companyName,
          canteen: '',
          dishes: dishesStr,
          createdAt: new Date(order.created_at).toLocaleString('pl-PL'),
        });
      });
      cancelledList.sort((a, b) => a.shift - b.shift || a.company.localeCompare(b.company));
    }

    setShift1Summary(s1);
    setShift2Summary(s2);
    detailedList.sort((a, b) => a.shift - b.shift || a.company.localeCompare(b.company));
    setDetailedOrders(detailedList);
    activeList.sort((a, b) => a.shift - b.shift || a.id - b.id);
    setActiveOrders(activeList);
    setCancelledOrders(cancelledList);
  }

  // Pobieranie statystyk
  async function fetchStatistics() {
    setStatsLoading(true);
    
    // Ustalanie zakresów dat (dzisiaj, ten tydzień, ten miesiąc)
    const now = new Date();
    // Reset czasu dla dzisiaj
    const todayStr = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw' }).format(now);
    
    // Początek miesiąca
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthStartStr = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw' }).format(firstDayOfMonth);
    
    // Pobieramy zamówienia z całego obecnego miesiąca
    const { data } = await supabase
      .from('orders')
      .select(`
        delivery_date,
        order_items ( quantity, menu_items ( name, price ) )
      `)
      .gte('delivery_date', monthStartStr)
      .in('status', ['approved', 'paid_via_blik']);

    if (data) {
      let todayRev = 0, todayCount = 0;
      let weekRev = 0, weekCount = 0;
      let monthRev = 0, monthCount = 0;
      const dishCounts = {};

      // Do obliczenia tygodnia - bierzemy ostatnie 7 dni
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(now.getDate() - 7);
      const sevenDaysAgoStr = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw' }).format(sevenDaysAgo);

      data.forEach(order => {
        const isToday = order.delivery_date === todayStr;
        const isThisWeek = order.delivery_date >= sevenDaysAgoStr;
        // wszystkie są isThisMonth, bo filtrujemy w zapytaniu

        order.order_items.forEach(item => {
          if (!item.menu_items) return; // zabezpieczenie
          const dishName = item.menu_items.name;
          const price = item.menu_items.price || 0;
          const qty = item.quantity || 1;
          const totalLineValue = price * qty;

          // Dzisiaj
          if (isToday) {
            todayRev += totalLineValue;
            todayCount += qty;
          }
          // Tydzień
          if (isThisWeek) {
            weekRev += totalLineValue;
            weekCount += qty;
          }
          // Miesiąc
          monthRev += totalLineValue;
          monthCount += qty;

          // Do rankingu zliczamy dla całego miesiąca
          dishCounts[dishName] = (dishCounts[dishName] || 0) + qty;
        });
      });

      // Sortowanie top dań
      const topDishes = Object.entries(dishCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10); // top 10

      setStatsData({
        today: { revenue: todayRev, count: todayCount },
        week: { revenue: weekRev, count: weekCount },
        month: { revenue: monthRev, count: monthCount },
        topDishes
      });
    }
    setStatsLoading(false);
  }

  const canCancel = (shift) => {
    if (!settings) return false;
    
    const now = new Date();
    const todayStr = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw' }).format(now);
    
    const isPrevDay = shift === 1 ? settings.cancel_cutoff_shift1_prev_day : settings.cancel_cutoff_shift2_prev_day;
    const cutoffTime = shift === 1 ? settings.cancel_cutoff_shift1 : settings.cancel_cutoff_shift2;
    
    const deliveryDateObj = new Date(selectedDate);
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

  const saveSettings = async () => {
    const { error } = await supabase.from('system_settings').update({
      order_cutoff_shift1: settings.order_cutoff_shift1,
      order_cutoff_shift1_prev_day: settings.order_cutoff_shift1_prev_day,
      order_cutoff_shift2: settings.order_cutoff_shift2,
      order_cutoff_shift2_prev_day: settings.order_cutoff_shift2_prev_day,
      cancel_cutoff_shift1: settings.cancel_cutoff_shift1,
      cancel_cutoff_shift1_prev_day: settings.cancel_cutoff_shift1_prev_day,
      cancel_cutoff_shift2: settings.cancel_cutoff_shift2,
      cancel_cutoff_shift2_prev_day: settings.cancel_cutoff_shift2_prev_day,
    }).eq('id', 1);
    
    if (error) toast.error('Błąd zapisu ustawień: ' + error.message);
    else toast.success('Ustawienia pomyślnie zapisane!');
  };

  const handleCancelOrder = async (orderId) => {
    if (!confirm('Czy na pewno chcesz anulować to zamówienie? Nie można tego cofnąć.')) return;
    
    const { error } = await supabase
      .from('orders')
      .update({ status: 'cancelled' })
      .eq('id', orderId);
      
    if (error) {
      toast.error('Błąd podczas anulowania: ' + error.message);
    } else {
      toast.success('Zamówienie zostało pomyślnie anulowane.');
      fetchProduction();
      if (activeTab === 'statystyki') fetchStatistics();
    }
  };

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

  async function fetchPastMenu() {
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw' }).format(new Date());
    const { data } = await supabase
      .from('menu_items')
      .select('id, name, price, available_date')
      .lt('available_date', today)
      .order('available_date', { ascending: false });
    if (data) setPastMenuItems(data);
  }

  function toggleCopyPanel() {
    if (!showCopyPanel && pastMenuItems.length === 0) fetchPastMenu();
    setShowCopyPanel(prev => !prev);
    setCopySourceDate('');
  }

  async function handleCopyDish(dish) {
    const { error } = await supabase.from('menu_items').insert([{
      name: dish.name,
      price: dish.price,
      available_date: selectedDate,
    }]);
    if (error) {
      toast.error('Błąd kopiowania: ' + error.message);
    } else {
      toast.success(`"${dish.name}" dodano na ${selectedDate}.`);
      fetchRestaurantData();
    }
  }

  async function handleCopyAll() {
    const items = pastMenuItems
      .filter(i => i.available_date === copySourceDate)
      .map(d => ({ name: d.name, price: d.price, available_date: selectedDate }));
    if (items.length === 0) return;
    setCopyingAll(true);
    const { error } = await supabase.from('menu_items').insert(items);
    setCopyingAll(false);
    if (error) {
      toast.error('Błąd kopiowania: ' + error.message);
    } else {
      toast.success(`Skopiowano ${items.length} dań na ${selectedDate}.`);
      fetchRestaurantData();
    }
  }

  // Uruchamianie drukowania z odpowiednim układem
  const handlePrint = (mode, shift = 'all') => {
    setPrintMode(mode);
    setPrintShift(shift);
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
          <div className="hidden print:block font-sans text-slate-900">
            {/* Nowoczesny Header */}
            <div className="flex justify-between items-end border-b-2 border-slate-800 pb-6 mb-10">
              <div>
                <h1 className="text-4xl font-heading font-black tracking-tight text-slate-900 uppercase">Raport Produkcyjny</h1>
                <p className="text-lg text-slate-500 mt-1">Podsumowanie zamówień do przygotowania</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-1">Data Realizacji</p>
                <p className="text-3xl font-heading font-black bg-slate-100 px-4 py-2 rounded-xl border border-slate-200">{selectedDate}</p>
              </div>
            </div>

            <div className={`grid grid-cols-1 ${printShift === 'all' ? 'grid-cols-2' : ''} gap-12`}>
              {/* KOLUMNA 1 */}
              {(printShift === 'all' || printShift === 1) && (
                <div>
                  <div className="flex items-center gap-4 mb-6">
                    <div className="bg-slate-800 text-white w-10 h-10 rounded-full flex items-center justify-center font-black text-xl">1</div>
                    <h2 className="text-2xl font-black uppercase tracking-wider">Pierwsza Zmiana</h2>
                  </div>
                  
                  {Object.keys(printShift1Summary).length === 0 ? <p className="italic text-slate-400 bg-slate-50 p-6 rounded-2xl text-center border border-dashed border-slate-200">Brak zamówień na tę zmianę</p> : (
                    <div className="rounded-2xl overflow-hidden border border-slate-200">
                      <table className="w-full text-left">
                        <thead className="bg-slate-100 border-b border-slate-200">
                          <tr>
                            <th className="py-3 px-5 text-xs font-bold text-slate-500 uppercase tracking-widest">Danie</th>
                            <th className="py-3 px-5 text-right text-xs font-bold text-slate-500 uppercase tracking-widest">Ilość</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {Object.entries(printShift1Summary).map(([name, qty]) => (
                            <tr key={name} className="break-inside-avoid">
                              <td className="py-4 px-5 font-bold text-lg text-slate-800">{name}</td>
                              <td className="py-4 px-5 text-right"><span className="text-2xl font-black bg-slate-50 px-3 py-1 rounded-lg border border-slate-200">{qty}</span></td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-slate-50 border-t-2 border-slate-800">
                          <tr>
                            <td className="py-4 px-5 font-black uppercase text-sm">Suma porcji:</td>
                            <td className="py-4 px-5 text-right text-2xl font-black">{Object.values(printShift1Summary).reduce((a, b) => a + b, 0)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* KOLUMNA 2 */}
              {(printShift === 'all' || printShift === 2) && (
                <div>
                  <div className="flex items-center gap-4 mb-6">
                    <div className="bg-slate-800 text-white w-10 h-10 rounded-full flex items-center justify-center font-black text-xl">2</div>
                    <h2 className="text-2xl font-black uppercase tracking-wider">Druga Zmiana</h2>
                  </div>

                  {Object.keys(printShift2Summary).length === 0 ? <p className="italic text-slate-400 bg-slate-50 p-6 rounded-2xl text-center border border-dashed border-slate-200">Brak zamówień na tę zmianę</p> : (
                    <div className="rounded-2xl overflow-hidden border border-slate-200">
                      <table className="w-full text-left">
                        <thead className="bg-slate-100 border-b border-slate-200">
                          <tr>
                            <th className="py-3 px-5 text-xs font-bold text-slate-500 uppercase tracking-widest">Danie</th>
                            <th className="py-3 px-5 text-right text-xs font-bold text-slate-500 uppercase tracking-widest">Ilość</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {Object.entries(printShift2Summary).map(([name, qty]) => (
                            <tr key={name} className="break-inside-avoid">
                              <td className="py-4 px-5 font-bold text-lg text-slate-800">{name}</td>
                              <td className="py-4 px-5 text-right"><span className="text-2xl font-black bg-slate-50 px-3 py-1 rounded-lg border border-slate-200">{qty}</span></td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-slate-50 border-t-2 border-slate-800">
                          <tr>
                            <td className="py-4 px-5 font-black uppercase text-sm">Suma porcji:</td>
                            <td className="py-4 px-5 text-right text-2xl font-black">{Object.values(printShift2Summary).reduce((a, b) => a + b, 0)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
            
            <div className="mt-16 pt-6 border-t border-slate-200 text-center">
              <p className="text-xs text-slate-400 font-medium">Wygenerowano z Systemu Zamówień B2B • Wszelkie niezgodności należy zgłaszać administratorowi.</p>
            </div>
          </div>
        )}

        {/* ========================================= */}
        {/* WIDOK DO DRUKU 2: NAKLEJKI 70x37mm        */}
        {/* ========================================= */}
        {printMode === 'stickers' && (
          <div className="hidden print:block text-slate-900">
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
                padding: 4mm;
                box-sizing: border-box;
                border: 1px dashed #e2e8f0;
                overflow: hidden;
                display: flex;
                flex-direction: column;
                justify-content: space-between;
              }
            `}</style>
            <div className="stickers-grid">
              {printFilteredDetailed
                .filter(order => printShift === 'all' || order.shift === printShift)
                .map((order, idx) => (
                <div key={idx} className="sticker font-sans">
                  <div className="text-center mb-1">
                    <p className="text-[12pt] font-black leading-tight truncate">{order.person}</p>
                    <p className="text-[8pt] text-slate-500 font-bold truncate tracking-wide uppercase border-b border-slate-200 pb-1 mx-2">
                      {order.company} {order.canteen && `- ${order.canteen}`}
                    </p>
                  </div>
                  <div className="flex-grow flex items-center justify-center">
                    <p className="text-[14pt] font-heading font-black leading-none text-center px-1 break-words">{order.dish}</p>
                  </div>
                  <div className="flex justify-between items-end mt-1 px-1">
                    <span className="text-[8pt] font-bold text-slate-400">{selectedDate}</span>
                    <span className="text-[10pt] font-black bg-slate-800 text-white px-2 py-0.5 rounded-md leading-none">ZM {order.shift}</span>
                  </div>
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
          <header className="mb-8 glass p-4 md:p-6 rounded-3xl">
            <div className="flex justify-between items-center mb-4">
              <h1 className="text-2xl font-heading font-black text-slate-800 flex items-center gap-2">
                <span className="text-3xl">👨‍🍳</span> Panel Restauracji
              </h1>
              <Link href="/" className="bg-white/60 px-5 py-2.5 rounded-xl shadow-sm border border-slate-200/50 text-sm font-bold text-slate-600 hover:bg-white hover:shadow-md transition-all backdrop-blur-sm">Wyjście</Link>
            </div>
            <div className="flex flex-wrap gap-2 bg-white/50 p-1.5 rounded-2xl backdrop-blur-sm border border-slate-200/50">
              <button onClick={() => setActiveTab('menu')} className={`flex-1 px-4 py-2.5 rounded-xl font-bold text-sm transition-all duration-300 ${activeTab === 'menu' ? 'bg-white shadow-md text-blue-600 scale-105' : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'}`}>📅 Planowanie Menu</button>
              <button onClick={() => setActiveTab('produkcja')} className={`flex-1 px-4 py-2.5 rounded-xl font-bold text-sm transition-all duration-300 ${activeTab === 'produkcja' ? 'bg-white shadow-md text-orange-600 scale-105' : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'}`}>🔥 Raporty i naklejki</button>
              <button onClick={() => setActiveTab('statystyki')} className={`flex-1 px-4 py-2.5 rounded-xl font-bold text-sm transition-all duration-300 ${activeTab === 'statystyki' ? 'bg-white shadow-md text-green-600 scale-105' : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'}`}>📊 Statystyki</button>
              <button onClick={() => setActiveTab('baza')} className={`flex-1 px-4 py-2.5 rounded-xl font-bold text-sm transition-all duration-300 ${activeTab === 'baza' ? 'bg-white shadow-md text-purple-600 scale-105' : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'}`}>📖 Baza Dań</button>
              <button onClick={() => setActiveTab('ustawienia')} className={`flex-1 px-4 py-2.5 rounded-xl font-bold text-sm transition-all duration-300 ${activeTab === 'ustawienia' ? 'bg-white shadow-md text-slate-800 scale-105' : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'}`}>⚙️ Ustawienia</button>
            </div>
          </header>

          {/* PASEK Z KALENDARZEM */}
          {(activeTab === 'menu' || activeTab === 'produkcja') && (
            <div className="glass p-5 md:p-6 rounded-3xl mb-8 border border-slate-200/50">
              <div className="flex justify-between items-center mb-4">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">Wybierz dzień</p>
                <div className="relative">
                  <button
                    ref={datePickerBtnRef}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!showDatePicker) {
                        const rect = datePickerBtnRef.current.getBoundingClientRect();
                        const left = Math.max(4, Math.min(rect.right - 288, window.innerWidth - 292));
                        setPickerPos({ top: rect.bottom + 8, left });
                      }
                      setShowDatePicker(p => !p);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white/60 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-white hover:shadow-sm transition-all backdrop-blur-sm"
                  >
                    📅 Wybierz datę
                  </button>
                  {showDatePicker && (
                    <DatePickerDropdown
                      year={pickerYear} month={pickerMonth}
                      selectedDate={selectedDate}
                      pos={pickerPos}
                      onClose={() => setShowDatePicker(false)}
                      onSelectDate={(d) => { setSelectedDate(d); setCalendarOffset(getDayDiff(d)); setShowDatePicker(false); }}
                      onPrevMonth={() => pickerMonth === 0 ? (setPickerYear(y => y - 1), setPickerMonth(11)) : setPickerMonth(m => m - 1)}
                      onNextMonth={() => pickerMonth === 11 ? (setPickerYear(y => y + 1), setPickerMonth(0)) : setPickerMonth(m => m + 1)}
                      onPrevYear={() => setPickerYear(y => y - 1)}
                      onNextYear={() => setPickerYear(y => y + 1)}
                    />
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCalendarOffset(p => p - 1)}
                  className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-white/60 border border-slate-200/50 hover:bg-white hover:shadow-md text-slate-600 font-black text-lg transition-all backdrop-blur-sm"
                >‹</button>
                <div className="flex gap-2 overflow-x-auto flex-1 pb-1 scrollbar-hide" style={{ msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
                  {getDaysWindow(calendarOffset).map((day) => {
                    const isSelected = selectedDate === day.date;
                    return (
                      <button key={day.date} onClick={() => setSelectedDate(day.date)} className={`flex flex-col items-center justify-center min-w-[68px] py-3 rounded-2xl transition-all duration-300 shrink-0 ${isSelected ? (activeTab === 'menu' ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/30 scale-105' : 'bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-lg shadow-orange-500/30 scale-105') : 'bg-white/60 text-slate-500 border border-slate-200/50 hover:bg-white hover:shadow-md backdrop-blur-sm'}`}>
                        <span className={`text-[10px] font-bold uppercase mb-1 tracking-wider ${isSelected ? 'text-white/80' : 'text-slate-400'}`}>{day.name}</span>
                        <span className="text-xl font-heading font-black leading-none">{day.dayNum}</span>
                        {allItems.some(item => item.available_date === day.date) && <div className={`w-1.5 h-1.5 rounded-full mt-1.5 ${isSelected ? 'bg-white' : 'bg-slate-400'}`} />}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => setCalendarOffset(p => p + 1)}
                  className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-white/60 border border-slate-200/50 hover:bg-white hover:shadow-md text-slate-600 font-black text-lg transition-all backdrop-blur-sm"
                >›</button>
              </div>
            </div>
          )}

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
                  <button type="button" onClick={toggleCopyPanel} className="w-full flex justify-between items-center">
                    <h2 className="text-lg font-heading font-black text-slate-800 flex items-center gap-2"><span>📋</span> Kopiuj z poprzednich dni</h2>
                    <span className={`text-slate-400 text-xs font-bold transition-transform duration-300 ${showCopyPanel ? 'rotate-180' : ''}`}>▼</span>
                  </button>
                  {showCopyPanel && (() => {
                    const copySourceItems = pastMenuItems.filter(i => i.available_date === copySourceDate);
                    return (
                      <div className="mt-5">
                        <div className="flex items-center gap-2 mb-4">
                          <button type="button" onClick={() => setCopyCalOffset(p => p - 1)} className="shrink-0 w-8 h-8 flex items-center justify-center rounded-xl bg-white/60 border border-slate-200/50 hover:bg-white hover:shadow-md text-slate-600 font-black text-lg transition-all">‹</button>
                          <div className="flex gap-1.5 overflow-x-auto flex-1 pb-1 scrollbar-hide" style={{ msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
                            {getDaysWindow(copyCalOffset).map((day) => {
                              const isSelected = copySourceDate === day.date;
                              const hasDishes = pastMenuItems.some(item => item.available_date === day.date);
                              return (
                                <button key={day.date} type="button" onClick={() => setCopySourceDate(day.date)} className={`flex flex-col items-center justify-center min-w-[60px] py-2.5 rounded-xl transition-all duration-300 shrink-0 ${isSelected ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md scale-105' : 'bg-white/60 text-slate-500 border border-slate-200/50 hover:bg-white hover:shadow-sm backdrop-blur-sm'}`}>
                                  <span className={`text-[9px] font-bold uppercase mb-0.5 tracking-wider ${isSelected ? 'text-white/80' : 'text-slate-400'}`}>{day.name}</span>
                                  <span className="text-lg font-heading font-black leading-none">{day.dayNum}</span>
                                  {hasDishes && <div className={`w-1 h-1 rounded-full mt-1 ${isSelected ? 'bg-white' : 'bg-blue-400'}`} />}
                                </button>
                              );
                            })}
                          </div>
                          <button type="button" onClick={() => setCopyCalOffset(p => p + 1)} className="shrink-0 w-8 h-8 flex items-center justify-center rounded-xl bg-white/60 border border-slate-200/50 hover:bg-white hover:shadow-md text-slate-600 font-black text-lg transition-all">›</button>
                          <div className="relative shrink-0">
                            <button ref={copyDatePickerBtnRef} type="button" onClick={(e) => { e.stopPropagation(); if (!showCopyDatePicker) { const rect = copyDatePickerBtnRef.current.getBoundingClientRect(); const left = Math.max(4, Math.min(rect.right - 288, window.innerWidth - 292)); setCopyPickerPos({ top: rect.bottom + 8, left }); } setShowCopyDatePicker(p => !p); }} className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/60 border border-slate-200 hover:bg-white hover:shadow-sm transition-all text-base backdrop-blur-sm" title="Wybierz datę">📅</button>
                            {showCopyDatePicker && (
                              <DatePickerDropdown year={copyPickerYear} month={copyPickerMonth} selectedDate={copySourceDate} pos={copyPickerPos} onClose={() => setShowCopyDatePicker(false)} onSelectDate={(d) => { setCopySourceDate(d); setCopyCalOffset(getDayDiff(d)); setShowCopyDatePicker(false); }} onPrevMonth={() => copyPickerMonth === 0 ? (setCopyPickerYear(y => y - 1), setCopyPickerMonth(11)) : setCopyPickerMonth(m => m - 1)} onNextMonth={() => copyPickerMonth === 11 ? (setCopyPickerYear(y => y + 1), setCopyPickerMonth(0)) : setCopyPickerMonth(m => m + 1)} onPrevYear={() => setCopyPickerYear(y => y - 1)} onNextYear={() => setCopyPickerYear(y => y + 1)} />
                            )}
                          </div>
                        </div>
                        {copySourceDate && (
                          <>
                            <div className="flex justify-between items-center mb-3">
                              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Dania z {copySourceDate}:</p>
                              <button type="button" onClick={handleCopyAll} disabled={copyingAll || copySourceItems.length === 0} className="text-xs font-bold bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-1.5 rounded-xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all disabled:opacity-60 disabled:transform-none">
                                {copyingAll ? 'Kopiowanie…' : 'Kopiuj wszystkie'}
                              </button>
                            </div>
                            {copySourceItems.length === 0 ? (
                              <p className="text-slate-400 italic text-center py-3 text-sm bg-white/40 rounded-xl border border-dashed border-slate-300">Brak menu na ten dzień.</p>
                            ) : (
                              <ul className="space-y-2">
                                {copySourceItems.map(item => (
                                  <li key={item.id} className="flex justify-between items-center p-3 bg-white/60 rounded-xl border border-slate-200/50 hover:bg-white transition-all">
                                    <div><p className="font-bold text-slate-800 text-sm">{item.name}</p><p className="text-indigo-600 font-black text-xs">{item.price} zł</p></div>
                                    <button type="button" onClick={() => handleCopyDish(item)} className="text-xs font-bold text-blue-600 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors shadow-sm whitespace-nowrap">+ Dodaj</button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })()}
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

              {/* OPINIE */}
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
              
              <div className="mb-8 glass p-6 rounded-3xl border border-slate-200/50">
                <h2 className="text-2xl font-heading font-black text-slate-800 mb-5">Raport dnia: <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-orange-600">{selectedDate}</span></h2>

                <div className="flex flex-col lg:flex-row gap-4">
                  <div className="flex flex-col sm:flex-row gap-4 bg-white/40 p-4 rounded-2xl border border-slate-200/50 flex-1">
                    <div className="flex flex-col gap-1.5 flex-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Filtruj wg Firmy</label>
                      <select className="p-2.5 rounded-xl border border-slate-200 text-sm font-semibold bg-white text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20 shadow-sm transition-all hover:bg-slate-50" value={printFilterCompany} onChange={handlePrintCompanyChange}>
                        <option value="all">Wszystkie Firmy</option>
                        {uniquePrintCompanies.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1.5 flex-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Filtruj wg Stołówki</label>
                      <select className="p-2.5 rounded-xl border border-slate-200 text-sm font-semibold bg-white text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20 shadow-sm transition-all hover:bg-slate-50" value={printFilterCanteen} onChange={(e) => setPrintFilterCanteen(e.target.value)}>
                        <option value="all">Wszystkie Stołówki</option>
                        {uniquePrintCanteens.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-4">
                    <div className="flex flex-col gap-2">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">🖨️ Raport Kuchni</span>
                      <div className="flex gap-2">
                        <button onClick={() => handlePrint('report', 'all')} className="bg-slate-800 text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-slate-900 shadow-sm transition-all hover:-translate-y-0.5">Wszystko</button>
                        <button onClick={() => handlePrint('report', 1)} className="bg-slate-600 text-white px-3 py-2 rounded-xl font-bold text-sm hover:bg-slate-700 shadow-sm transition-all hover:-translate-y-0.5">ZM 1</button>
                        <button onClick={() => handlePrint('report', 2)} className="bg-slate-600 text-white px-3 py-2 rounded-xl font-bold text-sm hover:bg-slate-700 shadow-sm transition-all hover:-translate-y-0.5">ZM 2</button>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">🏷️ Naklejki</span>
                      <div className="flex gap-2">
                        <button onClick={() => handlePrint('stickers', 'all')} className="bg-gradient-to-br from-orange-400 to-orange-600 text-white px-4 py-2 rounded-xl font-bold text-sm hover:from-orange-500 hover:to-orange-700 shadow-sm transition-all hover:-translate-y-0.5">Wszystko</button>
                        <button onClick={() => handlePrint('stickers', 1)} className="bg-orange-500 text-white px-3 py-2 rounded-xl font-bold text-sm hover:bg-orange-600 shadow-sm transition-all hover:-translate-y-0.5">ZM 1</button>
                        <button onClick={() => handlePrint('stickers', 2)} className="bg-orange-500 text-white px-3 py-2 rounded-xl font-bold text-sm hover:bg-orange-600 shadow-sm transition-all hover:-translate-y-0.5">ZM 2</button>
                      </div>
                    </div>
                  </div>
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
                <div className="overflow-x-auto rounded-2xl border border-slate-200/50 shadow-sm bg-white/40">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-white/60 text-slate-600 text-xs uppercase tracking-wider border-b border-slate-200/50">
                        <th className="p-5 font-bold">Zmiana</th>
                        <th className="p-5 font-bold">Firma / Stołówka</th>
                        <th className="p-5 font-bold">Pracownik</th>
                        <th className="p-5 font-bold">Danie</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/50">
                      {detailedOrders.map((order, idx) => (
                        <tr key={idx} className="hover:bg-white/80 transition-colors">
                          <td className="p-5">
                            <span className={`font-bold px-3 py-1.5 rounded-lg text-xs tracking-wider shadow-sm ${order.shift === 1 ? 'bg-orange-100 text-orange-700 border border-orange-200' : 'bg-indigo-100 text-indigo-700 border border-indigo-200'}`}>
                              ZM {order.shift}
                            </span>
                          </td>
                          <td className="p-5 font-bold text-slate-800">{order.company} {order.canteen && <span className="text-xs font-normal text-slate-400">({order.canteen})</span>}</td>
                          <td className="p-5 text-slate-600 font-medium">{order.person}</td>
                          <td className="p-5 font-black text-slate-800">{order.dish}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* LISTA ZAMÓWIEŃ DO ZARZĄDZANIA */}
              <div className="glass p-8 rounded-3xl shadow-lg border border-slate-200/50 mt-8">
                <h3 className="text-xl font-heading font-black text-slate-800 mb-6 flex items-center gap-2"><span>🛡️</span> Zarządzanie Zamówieniami na ten dzień:</h3>
                {activeOrders.length === 0 ? (
                  <div className="p-12 text-center bg-white/40 rounded-2xl border-2 border-dashed border-slate-300">
                    <p className="text-slate-500 font-medium">Brak aktywnych zamówień.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {activeOrders.map(order => (
                      <div key={order.id} className="bg-white/60 p-5 rounded-2xl border border-slate-200/50 shadow-sm flex flex-col md:flex-row justify-between md:items-center gap-4 hover:bg-white hover:shadow-md transition-all">
                        <div>
                          <div className="flex items-center gap-3 mb-1">
                            <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-md">ID: {order.id}</span>
                            <span className={`text-xs font-bold px-2 py-1 rounded-md ${order.shift === 1 ? 'bg-orange-100 text-orange-700' : 'bg-indigo-100 text-indigo-700'}`}>ZM {order.shift}</span>
                            <span className="font-bold text-slate-800">{order.person}</span>
                          </div>
                          <p className="font-black text-slate-700">{order.dishes}</p>
                          <p className="text-[10px] text-slate-400 mt-1">{order.company} {order.canteen && <span>- {order.canteen}</span>}</p>
                        </div>
                        {canCancel(order.shift) ? (
                          <button onClick={() => handleCancelOrder(order.id)} className="bg-white text-red-500 border border-red-200 px-4 py-2 rounded-xl font-bold text-sm hover:bg-red-50 active:scale-95">Anuluj</button>
                        ) : <span className="text-xs font-bold text-slate-400">Czas minął</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ANULOWANE */}
              {cancelledOrders.length > 0 && (
                <div className="glass p-8 rounded-3xl shadow-lg border border-red-200/60 mt-8">
                  <h3 className="text-xl font-heading font-black text-red-600 mb-6">🚫 Anulowane zamówienia</h3>
                  <div className="overflow-x-auto rounded-2xl border border-red-100 bg-white/40">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-red-50/80 text-slate-600 text-xs uppercase tracking-wider border-b border-red-100">
                          <th className="p-5 font-bold">Zamówienie</th>
                          <th className="p-5 font-bold">Klient</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cancelledOrders.map((order, idx) => (
                          <tr key={idx} className="hover:bg-red-50/40 transition-colors">
                            <td className="p-5 text-sm font-black text-slate-700 line-through decoration-red-400">{order.dishes}</td>
                            <td className="p-5 text-sm font-medium text-slate-500">
                              <p className="font-bold text-slate-700">{order.person}</p>
                              <p className="text-xs text-slate-400">{order.company} {order.canteen && `- ${order.canteen}`}</p>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

            </div>
          )}

          {/* --- ZAKŁADKA: USTAWIENIA --- */}
          {activeTab === 'ustawienia' && settings && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-2xl mx-auto">
              <div className="glass p-8 rounded-3xl shadow-lg border border-slate-200/50">
                <h2 className="text-2xl font-heading font-black text-slate-800 mb-6 flex items-center gap-2"><span>⚙️</span> Ustawienia Systemowe</h2>
                
                <div className="space-y-6">
                  <div className="bg-white/60 p-6 rounded-2xl border border-slate-200/50 shadow-sm">
                    <h3 className="text-lg font-bold text-slate-800 mb-4 border-b border-slate-200 pb-2">Zamawianie (do kiedy można składać nowe zamówienia?)</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-orange-500"></span> I Zmiana</label>
                        <div className="space-y-3">
                          <input type="time" value={settings.order_cutoff_shift1.substring(0, 5)} onChange={(e) => setSettings({...settings, order_cutoff_shift1: e.target.value + ':00'})} className="w-full p-3 rounded-lg border border-slate-200 font-bold bg-white focus:ring-2 focus:ring-blue-500 outline-none text-slate-700" />
                          <select value={settings.order_cutoff_shift1_prev_day ? "true" : "false"} onChange={(e) => setSettings({...settings, order_cutoff_shift1_prev_day: e.target.value === "true"})} className="w-full p-3 rounded-lg border border-slate-200 font-bold bg-white focus:ring-2 focus:ring-blue-500 outline-none text-slate-700">
                            <option value="false">W dniu dostawy</option>
                            <option value="true">Dzień przed dostawą</option>
                          </select>
                        </div>
                      </div>
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-indigo-500"></span> II Zmiana</label>
                        <div className="space-y-3">
                          <input type="time" value={settings.order_cutoff_shift2.substring(0, 5)} onChange={(e) => setSettings({...settings, order_cutoff_shift2: e.target.value + ':00'})} className="w-full p-3 rounded-lg border border-slate-200 font-bold bg-white focus:ring-2 focus:ring-blue-500 outline-none text-slate-700" />
                          <select value={settings.order_cutoff_shift2_prev_day ? "true" : "false"} onChange={(e) => setSettings({...settings, order_cutoff_shift2_prev_day: e.target.value === "true"})} className="w-full p-3 rounded-lg border border-slate-200 font-bold bg-white focus:ring-2 focus:ring-blue-500 outline-none text-slate-700">
                            <option value="false">W dniu dostawy</option>
                            <option value="true">Dzień przed dostawą</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-white/60 p-6 rounded-2xl border border-slate-200/50 shadow-sm">
                    <h3 className="text-lg font-bold text-slate-800 mb-4 border-b border-slate-200 pb-2">Anulowanie (do kiedy można anulować zamówienia?)</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-orange-500"></span> I Zmiana</label>
                        <div className="space-y-3">
                          <input type="time" value={settings.cancel_cutoff_shift1.substring(0, 5)} onChange={(e) => setSettings({...settings, cancel_cutoff_shift1: e.target.value + ':00'})} className="w-full p-3 rounded-lg border border-slate-200 font-bold bg-white focus:ring-2 focus:ring-blue-500 outline-none text-slate-700" />
                          <select value={settings.cancel_cutoff_shift1_prev_day ? "true" : "false"} onChange={(e) => setSettings({...settings, cancel_cutoff_shift1_prev_day: e.target.value === "true"})} className="w-full p-3 rounded-lg border border-slate-200 font-bold bg-white focus:ring-2 focus:ring-blue-500 outline-none text-slate-700">
                            <option value="false">W dniu dostawy</option>
                            <option value="true">Dzień przed dostawą</option>
                          </select>
                        </div>
                      </div>
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-indigo-500"></span> II Zmiana</label>
                        <div className="space-y-3">
                          <input type="time" value={settings.cancel_cutoff_shift2.substring(0, 5)} onChange={(e) => setSettings({...settings, cancel_cutoff_shift2: e.target.value + ':00'})} className="w-full p-3 rounded-lg border border-slate-200 font-bold bg-white focus:ring-2 focus:ring-blue-500 outline-none text-slate-700" />
                          <select value={settings.cancel_cutoff_shift2_prev_day ? "true" : "false"} onChange={(e) => setSettings({...settings, cancel_cutoff_shift2_prev_day: e.target.value === "true"})} className="w-full p-3 rounded-lg border border-slate-200 font-bold bg-white focus:ring-2 focus:ring-blue-500 outline-none text-slate-700">
                            <option value="false">W dniu dostawy</option>
                            <option value="true">Dzień przed dostawą</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <button onClick={saveSettings} className="w-full mt-4 bg-slate-800 text-white font-bold py-4 rounded-xl hover:bg-slate-900 transition-all shadow-md hover:shadow-lg active:scale-95 flex items-center justify-center gap-2">
                    <span>💾</span> Zapisz Ustawienia
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* --- ZAKŁADKA 3: STATYSTYKI --- */}
          {activeTab === 'statystyki' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">
              
              {statsLoading ? (
                <div className="py-20 flex justify-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-green-500"></div>
                </div>
              ) : (
                <>
                  <div className="glass p-8 rounded-3xl shadow-lg border border-slate-200/50 mb-8">
                    <h2 className="text-3xl font-heading font-black text-slate-800 mb-8">Podsumowanie <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-500 to-emerald-600">Sprzedaży</span></h2>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {/* Dziś */}
                      <div className="bg-white/60 p-6 rounded-2xl border border-slate-200/50 shadow-sm hover:shadow-md hover:bg-white transition-all">
                        <p className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-2">Dzisiaj</p>
                        <p className="text-4xl font-heading font-black text-slate-800 mb-1">{statsData.today.revenue.toFixed(2)} <span className="text-xl text-slate-400">zł</span></p>
                        <p className="text-green-600 font-bold bg-green-100/80 px-3 py-1 rounded-lg inline-block">{statsData.today.count} sprzedanych porcji</p>
                      </div>

                      {/* Ten tydzień */}
                      <div className="bg-white/60 p-6 rounded-2xl border border-slate-200/50 shadow-sm hover:shadow-md hover:bg-white transition-all relative overflow-hidden">
                        <div className="absolute -right-4 -top-4 w-24 h-24 bg-green-100 rounded-full blur-2xl opacity-60 pointer-events-none"></div>
                        <p className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-2 relative z-10">Ostatnie 7 dni</p>
                        <p className="text-4xl font-heading font-black text-slate-800 mb-1 relative z-10">{statsData.week.revenue.toFixed(2)} <span className="text-xl text-slate-400">zł</span></p>
                        <p className="text-green-600 font-bold bg-green-100/80 px-3 py-1 rounded-lg inline-block relative z-10">{statsData.week.count} sprzedanych porcji</p>
                      </div>

                      {/* Ten miesiąc */}
                      <div className="bg-gradient-to-br from-green-500 to-emerald-600 p-6 rounded-2xl shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all text-white relative overflow-hidden">
                        <div className="absolute -right-10 -top-10 w-40 h-40 bg-white rounded-full mix-blend-overlay filter blur-2xl opacity-20 pointer-events-none"></div>
                        <p className="text-sm font-bold text-green-100 uppercase tracking-widest mb-2 relative z-10">Ten miesiąc</p>
                        <p className="text-4xl font-heading font-black mb-1 relative z-10">{statsData.month.revenue.toFixed(2)} <span className="text-xl text-green-200">zł</span></p>
                        <p className="text-white font-bold bg-white/20 px-3 py-1 rounded-lg inline-block relative z-10 backdrop-blur-sm">{statsData.month.count} sprzedanych porcji</p>
                      </div>
                    </div>
                  </div>

                  {/* Ranking */}
                  <div className="glass p-8 rounded-3xl shadow-lg border border-slate-200/50">
                    <h2 className="text-2xl font-heading font-black text-slate-800 mb-6 flex items-center gap-2"><span>🏆</span> Top 10 Najchętniej Zamawianych Dań <span className="text-sm text-slate-400 font-medium ml-2">(w tym miesiącu)</span></h2>
                    
                    {statsData.topDishes.length === 0 ? (
                      <div className="p-12 text-center bg-white/40 rounded-2xl border-2 border-dashed border-slate-300">
                        <p className="text-slate-500 font-medium">Brak danych do wyświetlenia.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {statsData.topDishes.map((dish, idx) => (
                          <div key={dish.name} className="flex items-center justify-between p-4 bg-white/60 rounded-2xl border border-slate-200/50 hover:bg-white hover:shadow-md transition-all">
                            <div className="flex items-center gap-4">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black font-heading text-lg ${idx === 0 ? 'bg-yellow-100 text-yellow-600 shadow-sm' : idx === 1 ? 'bg-slate-200 text-slate-600 shadow-sm' : idx === 2 ? 'bg-orange-100 text-orange-700 shadow-sm' : 'bg-slate-50 text-slate-400'}`}>
                                {idx + 1}
                              </div>
                              <span className="font-bold text-lg text-slate-800">{dish.name}</span>
                            </div>
                            <div className="text-right">
                              <span className="text-xl font-black font-heading text-emerald-600 bg-emerald-50 px-4 py-1.5 rounded-xl shadow-sm border border-emerald-100">{dish.count} szt.</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* --- ZAKŁADKA 4: BAZA DAŃ --- */}
          {activeTab === 'baza' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="glass p-8 rounded-3xl shadow-lg border border-slate-200/50 mb-8">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                  <h2 className="text-3xl font-heading font-black text-slate-800">
                    Baza <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-500 to-pink-600">Dań</span>
                  </h2>
                  
                  {/* Wyszukiwarka */}
                  <div className="relative w-full md:w-72">
                    <input 
                      type="text" 
                      placeholder="Szukaj dania..." 
                      value={dishSearchQuery}
                      onChange={(e) => setDishSearchQuery(e.target.value)}
                      className="w-full p-3 pl-10 bg-white/60 border border-slate-200/50 rounded-xl outline-none focus:ring-4 focus:ring-purple-500/20 focus:border-purple-500 font-medium transition-all backdrop-blur-sm shadow-sm" 
                    />
                    <span className="absolute left-3 top-3.5 text-slate-400 leading-none">🔍</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {dishDictionary
                    .filter(dish => dish.name.toLowerCase().includes(dishSearchQuery.toLowerCase()))
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((dish, idx) => (
                      <div key={idx} className="bg-white/60 p-5 rounded-2xl border border-slate-200/50 shadow-sm hover:shadow-md hover:bg-white transition-all flex justify-between items-center group">
                        <span className="font-bold text-slate-800 group-hover:text-purple-700 transition-colors pr-2">{dish.name}</span>
                        <span className="text-sm font-black font-heading bg-purple-100/50 text-purple-700 px-3 py-1.5 rounded-xl border border-purple-200/50 whitespace-nowrap shadow-sm">{dish.price} zł</span>
                      </div>
                  ))}
                  
                  {dishDictionary.filter(dish => dish.name.toLowerCase().includes(dishSearchQuery.toLowerCase())).length === 0 && (
                    <div className="col-span-full p-12 text-center bg-white/40 rounded-2xl border-2 border-dashed border-slate-300">
                      <p className="text-slate-500 font-medium">Nie znaleziono żadnych dań pasujących do wyszukiwania.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </main>
  );
}
"use client";
import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';

import { getLocalToday, getDaysWindow, getDayDiff } from '../../lib/date-utils';
import DatePicker from '../../components/Calendar/DatePicker';

const MONTHS_PL = ['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec','Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień'];
const DAYS_SHORT = ['Pn','Wt','Śr','Cz','Pt','So','Nd'];

export default function RestauracjaPanel() {
  const router = useRouter();
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
  const [deliveredOrders, setDeliveredOrders] = useState([]);
  const [prodCountdown, setProdCountdown] = useState(300);
  const selectedDateRef = useRef('');
  const [statsMonth, setStatsMonth] = useState(() => {
    const todayStr = getLocalToday();
    return todayStr.substring(0, 7);
  });

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
    topDishes: [],
    isCurrentMonth: true,
  });
  const [statsLoading, setStatsLoading] = useState(false);

  // Faktury
  const [invoiceMonth, setInvoiceMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [invoiceData, setInvoiceData] = useState(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceNumbers, setInvoiceNumbers] = useState({ revenue: null, cost: null });

  // Publikowanie menu
  const [publishing, setPublishing] = useState(false);

  // Formularz i autouzupełnianie
  const [dishDictionary, setDishDictionary] = useState([]);
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newMaxQty, setNewMaxQty] = useState('');
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
    const today = getLocalToday();
    setSelectedDate(today);
    selectedDateRef.current = today;

    fetchRestaurantData();

    // Subskrypcja Realtime
    const channel = supabase
      .channel('restaurant_updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchProduction(selectedDateRef.current);
        if (activeTab === 'statystyki') fetchStatistics(statsMonth);
        if (activeTab === 'faktury') fetchInvoiceData(invoiceMonth);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' }, () => {
        fetchRestaurantData();
      })
      .subscribe();

    // Zamknięcie podpowiedzi po kliknięciu obok
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setShowSuggestions(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      supabase.removeChannel(channel);
    };
  }, []);

  // 2. Odświeżanie produkcji i statystyk
  useEffect(() => {
    selectedDateRef.current = selectedDate;
    if (selectedDate) fetchProduction(selectedDate);
  }, [selectedDate]);

  useEffect(() => {
    if (activeTab === 'statystyki') {
      fetchStatistics(statsMonth);
    }
  }, [activeTab, statsMonth]);

  useEffect(() => {
    if (activeTab === 'faktury') fetchInvoiceData(invoiceMonth);
  }, [activeTab, invoiceMonth]);

  // Auto-odświeżanie produkcji co 300 sekund (backup)
  useEffect(() => {
    if (activeTab !== 'produkcja') return;
    setProdCountdown(300);
    const interval = setInterval(() => {
      setProdCountdown(prev => {
        if (prev <= 1) {
          fetchProduction(selectedDateRef.current);
          return 300;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [activeTab]);

  // Pobieranie menu i opinii
  async function fetchRestaurantData() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/login');
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profileError || profile?.role !== 'restaurant') {
        toast.error('Brak uprawnień restauracji.');
        router.replace('/');
        return;
      }

      const [{ data: menuData, error: menuError }, { data: reviewsData, error: reviewsError }, { data: settingsData, error: settingsError }] = await Promise.all([
        supabase.from('menu_items').select('*'),
        supabase.from('order_items')
          .select(`id, rating, review_text, menu_items ( name ), orders ( profiles ( first_name, last_name ) )`)
          .not('rating', 'is', null)
          .order('id', { ascending: false }).limit(20),
        supabase.from('system_settings').select('*').eq('id', 1).single()
      ]);

      if (menuError) throw menuError;
      if (reviewsError) throw reviewsError;

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

      setReviews(reviewsData || []);
      if (settingsData) setSettings(settingsData);
    } catch (error) {
      console.error('Błąd pobierania danych restauracji:', error);
      toast.error('Nie udało się pobrać danych: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  // Pobieranie produkcji na dany dzień
  async function fetchProduction(date) {
    try {
      const targetDate = date || selectedDate;
      const orderSelect = `
        id,
        shift,
        created_at,
        profiles ( first_name, last_name, companies ( name ) ),
        order_items ( quantity, menu_items ( name ) )
      `;

      const [res, cancelledRes, deliveredRes] = await Promise.all([
        supabase.from('orders').select(orderSelect).eq('delivery_date', targetDate).in('status', ['approved', 'paid_via_blik']),
        supabase.from('orders').select(orderSelect).eq('delivery_date', targetDate).eq('status', 'cancelled'),
        supabase.from('orders').select(orderSelect).eq('delivery_date', targetDate).eq('status', 'delivered'),
      ]);

      if (res.error) throw res.error;
      if (cancelledRes.error) throw cancelledRes.error;
      if (deliveredRes.error) throw deliveredRes.error;

      const data = res.data;
      const cancelledData = cancelledRes.data;
      const deliveredData = deliveredRes.data;

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

    const deliveredList = [];
    if (deliveredData) {
      deliveredData.forEach(order => {
        const personName = `${order.profiles?.first_name} ${order.profiles?.last_name}`;
        const companyName = order.profiles?.companies?.name || 'Indywidualny';
        const dishesStr = order.order_items.map(item => `${item.quantity}x ${item.menu_items.name}`).join(', ');
        deliveredList.push({
          id: order.id,
          shift: order.shift,
          person: personName,
          company: companyName,
          dishes: dishesStr,
          createdAt: new Date(order.created_at).toLocaleString('pl-PL'),
        });
      });
      deliveredList.sort((a, b) => a.shift - b.shift || a.company.localeCompare(b.company));
    }
    setDeliveredOrders(deliveredList);
    } catch (error) {
      console.error('Błąd pobierania produkcji:', error);
      toast.error('Nie udało się pobrać danych produkcji: ' + error.message);
    }
  }

  // Pobieranie statystyk
  async function fetchStatistics(yearMonth) {
    try {
      setStatsLoading(true);

      const todayStr = getLocalToday();
      const currentYM = todayStr.substring(0, 7);
      const isCurrentMonth = yearMonth === currentYM;

      const { data: summary, error } = await supabase.rpc('get_restaurant_stats', { p_year_month: yearMonth });

      if (error) throw error;

      if (summary) {
        setStatsData({
          today: summary.today,
          week: summary.week,
          month: summary.month,
          topDishes: summary.top_dishes || [],
          isCurrentMonth,
        });
      }
    } catch (error) {
      console.error('Błąd pobierania statystyk:', error);
      toast.error('Nie udało się pobrać statystyk: ' + error.message);
    } finally {
      setStatsLoading(false);
    }
  }

  async function fetchInvoiceData(yearMonth) {
    try {
      setInvoiceLoading(true);
      setInvoiceData(null);
      const [y, m] = yearMonth.split('-').map(Number);
      const daysInMonth = new Date(y, m, 0).getDate();
      const monthStart = `${yearMonth}-01`;
      const monthEnd = `${yearMonth}-${String(daysInMonth).padStart(2, '0')}`;

      const [summaryRes, revNumRes, costNumRes] = await Promise.all([
        supabase.rpc('get_invoice_summary', { p_year_month: yearMonth }),
        supabase.rpc('get_or_create_invoice_number', { p_year_month: yearMonth, p_type: 'revenue' }),
        supabase.rpc('get_or_create_invoice_number', { p_year_month: yearMonth, p_type: 'cost' }),
      ]);

      if (summaryRes.error) throw summaryRes.error;
      if (revNumRes.error) throw revNumRes.error;
      if (costNumRes.error) throw costNumRes.error;

      const summary = summaryRes.data;
      const revNum = revNumRes.data || `FV/${y}/${String(m).padStart(2, '0')}`;
      const costNum = costNumRes.data || `FK/${y}/${String(m).padStart(2, '0')}`;

      setInvoiceNumbers({ revenue: revNum, cost: costNum });

      const revenueGross = summary.revenue_gross;
      const revenueNet = revenueGross / 1.08;
      const totalMeals = summary.total_meals;

      const costCompanies = summary.companies.map(c => ({
        ...c,
        net: c.gross / 1.08,
        vat: c.gross - c.gross / 1.08
      }));
      const costGross = costCompanies.reduce((s, c) => s + c.gross, 0);

      setInvoiceData({
        yearMonth,
        orderCount: summary.order_count,
        revenue: { gross: revenueGross, net: revenueNet, vat: revenueGross - revenueNet, meals: totalMeals },
        cost: { gross: costGross, net: costGross / 1.08, vat: costGross - costGross / 1.08, companies: costCompanies },
      });
    } catch (error) {
      console.error('Błąd pobierania danych faktur:', error);
      toast.error('Nie udało się pobrać danych faktur: ' + error.message);
    } finally {
      setInvoiceLoading(false);
    }
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
      restaurant_name: settings.restaurant_name || '',
      restaurant_nip: settings.restaurant_nip || '',
      restaurant_address: settings.restaurant_address || '',
      restaurant_bank_account: settings.restaurant_bank_account || '',
      invoice_payment_days: settings.invoice_payment_days || 14,
    }).eq('id', 1);
    
    if (error) toast.error('Błąd zapisu ustawień: ' + error.message);
    else toast.success('Ustawienia pomyślnie zapisane!');
  };

  function buildInvoiceHTML(type) {
    if (!invoiceData || !settings) return '';
    const now = new Date();
    const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const isDraft = invoiceData.yearMonth >= currentYM;
    const [y, m] = invoiceData.yearMonth.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const invoiceNum = type === 'revenue' ? invoiceNumbers.revenue : invoiceNumbers.cost;
    const issueDate = isDraft
      ? new Intl.DateTimeFormat('pl-PL').format(now)
      : `${String(daysInMonth).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`;
    const salePeriod = `01.${String(m).padStart(2, '0')}.${y}–${String(daysInMonth).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`;
    const payDue = new Date(y, m - 1, daysInMonth);
    payDue.setDate(payDue.getDate() + (settings.invoice_payment_days || 14));
    const paymentDate = new Intl.DateTimeFormat('pl-PL').format(payDue);
    const rName = settings.restaurant_name || 'Restauracja';
    const rNIP  = settings.restaurant_nip || '';
    const rAddr = settings.restaurant_address || '';
    const rBank = settings.restaurant_bank_account || '';
    const payDays = settings.invoice_payment_days || 14;
    const monthLabel = `${MONTHS_PL[m - 1]} ${y}`;
    const fmt = (v) => Number(v).toFixed(2).replace('.', ',') + ' zł';
    const CSS = `*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:11px;color:#1a1a1a;background:#fff;padding:15mm}.hdr{text-align:center;border-bottom:3px solid #1e293b;padding-bottom:12px;margin-bottom:18px}.hdr h1{font-size:22px;font-weight:900;letter-spacing:1px}.hdr .num{font-size:13px;color:#475569;margin-top:4px}.draft{display:inline-block;background:#fbbf24;color:#78350f;font-weight:900;font-size:9px;padding:2px 8px;border-radius:4px;margin-top:6px;text-transform:uppercase;letter-spacing:.05em}.meta{display:flex;justify-content:space-between;font-size:11px;margin-bottom:18px}.parties{display:flex;gap:16px;margin-bottom:20px}.party{flex:1;border:1px solid #e2e8f0;border-radius:6px;padding:10px}.party-lbl{font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;font-weight:700;margin-bottom:6px}.party-name{font-size:13px;font-weight:700;margin-bottom:3px}.party-det{color:#475569;line-height:1.6}table{width:100%;border-collapse:collapse;margin-bottom:14px}th{background:#1e293b;color:#fff;padding:7px 6px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.03em}td{padding:7px 6px;border-bottom:1px solid #f1f5f9}tr:nth-child(even) td{background:#f8fafc}.tr{text-align:right}.tot-box{display:flex;justify-content:flex-end;margin-bottom:18px}.tot-tbl{width:280px;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden}.tot-tbl td{padding:5px 12px;border:none;border-bottom:1px solid #f1f5f9;font-size:11px}.tot-tbl .grand{background:#1e293b;color:#fff;font-weight:700;font-size:13px;border:none}.pay{background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px;margin-bottom:18px}.pay h3{font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;margin-bottom:6px;font-weight:700}.pay p{line-height:1.8}.sigs{display:flex;gap:40px;margin-top:40px;padding-top:10px}.sig{flex:1;font-size:10px;color:#94a3b8;padding-top:36px;border-top:1px solid #1a1a1a}@media print{body{padding:10mm}@page{margin:10mm;size:A4}}`;
    const partiesHTML = `<div class="parties"><div class="party"><div class="party-lbl">Sprzedawca</div><div class="party-name">${rName}</div>${rNIP ? `<div class="party-det">NIP: ${rNIP}</div>` : ''}<div class="party-det">${rAddr}</div></div><div class="party"><div class="party-lbl">Nabywca</div><div class="party-name">${type === 'revenue' ? 'Nabywcy zbiorczy' : 'Pracodawcy — zestawienie zbiorcze'}</div><div class="party-det">Okres rozliczeniowy: ${salePeriod}</div></div></div>`;
    const payHTML = `<div class="pay"><h3>Informacje o płatności</h3><p><strong>Forma płatności:</strong> Przelew bankowy</p><p><strong>Nr rachunku:</strong> ${rBank || '—'}</p><p><strong>Termin płatności:</strong> ${paymentDate} (${payDays} dni)</p></div>`;
    const sigsHTML = `<div class="sigs"><div class="sig">Wystawił(a): ${rName}</div><div class="sig">Podpis i pieczęć nabywcy</div></div>`;

    let tableHTML, totHTML;
    if (type === 'revenue') {
      const { gross, net, vat, meals } = invoiceData.revenue;
      const unitNet = meals > 0 ? net / meals : 0;
      tableHTML = `<table><thead><tr><th>Lp.</th><th>Nazwa usługi</th><th class="tr">Ilość</th><th>J.m.</th><th class="tr">Cena netto</th><th class="tr">VAT%</th><th class="tr">Kwota VAT</th><th class="tr">Wartość brutto</th></tr></thead><tbody><tr><td>1</td><td>Usługa cateringowa — ${monthLabel}</td><td class="tr">${meals}</td><td>porcja</td><td class="tr">${fmt(unitNet)}</td><td class="tr">8%</td><td class="tr">${fmt(vat)}</td><td class="tr">${fmt(gross)}</td></tr></tbody></table>`;
      totHTML = `<div class="tot-box"><table class="tot-tbl"><tr><td>Razem netto:</td><td class="tr"><strong>${fmt(net)}</strong></td></tr><tr><td>VAT 8%:</td><td class="tr">${fmt(vat)}</td></tr><tr class="grand"><td>RAZEM BRUTTO:</td><td class="tr">${fmt(gross)}</td></tr></table></div>`;
    } else {
      const { gross, net, vat, companies } = invoiceData.cost;
      const rows = companies.map((c, i) => `<tr><td>${i + 1}</td><td>Dofinansowanie posiłków — ${c.name} — ${monthLabel}</td><td class="tr">${c.meals}</td><td>porcja</td><td class="tr">${fmt(c.meals > 0 ? c.net / c.meals : 0)}</td><td class="tr">8%</td><td class="tr">${fmt(c.vat)}</td><td class="tr">${fmt(c.gross)}</td></tr>`).join('');
      tableHTML = `<table><thead><tr><th>Lp.</th><th>Firma / Usługa</th><th class="tr">Ilość</th><th>J.m.</th><th class="tr">Cena netto</th><th class="tr">VAT%</th><th class="tr">Kwota VAT</th><th class="tr">Wartość brutto</th></tr></thead><tbody>${rows || '<tr><td colspan="8" style="text-align:center;color:#94a3b8">Brak dopłat pracodawcy w tym miesiącu</td></tr>'}</tbody></table>`;
      totHTML = `<div class="tot-box"><table class="tot-tbl"><tr><td>Razem netto:</td><td class="tr"><strong>${fmt(net)}</strong></td></tr><tr><td>VAT 8%:</td><td class="tr">${fmt(vat)}</td></tr><tr class="grand"><td>RAZEM BRUTTO:</td><td class="tr">${fmt(gross)}</td></tr></table></div>`;
    }

    const titleType = type === 'revenue' ? 'FAKTURA VAT' : 'FAKTURA VAT — Koszty Pracodawcy';
    return `<!DOCTYPE html><html lang="pl"><head><meta charset="UTF-8"><title>${titleType} ${invoiceNum}</title><style>${CSS}</style></head><body onload="window.print()"><div class="hdr"><h1>${titleType}</h1><div class="num">Nr ${invoiceNum}</div>${isDraft ? '<div class="draft">PROJEKT — miesiąc w toku</div>' : ''}</div><div class="meta"><div><strong>Data wystawienia:</strong> ${issueDate}</div><div><strong>Okres sprzedaży:</strong> ${salePeriod}</div></div>${partiesHTML}${tableHTML}${totHTML}${payHTML}${sigsHTML}</body></html>`;
  }

  function printInvoice(type) {
    const html = buildInvoiceHTML(type);
    if (!html) return;
    const win = window.open('', '_blank', 'width=960,height=1200');
    win.document.write(html);
    win.document.close();
  }

  const handleCancelOrder = async (orderId) => {
    if (!confirm('Czy na pewno chcesz anulować to zamówienie? Nie można tego cofnąć.')) return;
    const { error } = await supabase.from('orders').update({ status: 'cancelled' }).eq('id', orderId);
    if (error) {
      toast.error('Błąd podczas anulowania: ' + error.message);
    } else {
      toast.success('Zamówienie anulowane.');
      fetchProduction();
      if (activeTab === 'statystyki') fetchStatistics();
    }
  };

  const handleMarkDelivered = async (orderId) => {
    const { error } = await supabase.from('orders').update({ status: 'delivered' }).eq('id', orderId);
    if (error) {
      toast.error('Błąd: ' + error.message);
    } else {
      toast.success('Zamówienie oznaczone jako dostarczone.');
      fetchProduction();
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

  async function handlePublishMenu() {
    const unpublished = dailyMenu.filter(i => !i.is_published);
    if (unpublished.length === 0) return;
    setPublishing(true);
    const { error } = await supabase
      .from('menu_items')
      .update({ is_published: true })
      .eq('available_date', selectedDate)
      .eq('is_published', false);
    setPublishing(false);
    if (error) {
      toast.error('Błąd publikowania: ' + error.message);
    } else {
      toast.success(`Menu na ${selectedDate} opublikowane! Klienci mogą teraz zamawiać.`);
      fetchRestaurantData();
    }
  }

  async function handleUnpublishMenu() {
    const published = dailyMenu.filter(i => i.is_published);
    if (published.length === 0) return;
    setPublishing(true);
    const { error } = await supabase
      .from('menu_items')
      .update({ is_published: false })
      .eq('available_date', selectedDate)
      .eq('is_published', true);
    setPublishing(false);
    if (error) {
      toast.error('Błąd cofania publikacji: ' + error.message);
    } else {
      toast.success(`Menu na ${selectedDate} jest teraz robocze. Klienci nie widzą dań.`);
      fetchRestaurantData();
    }
  }

  async function handleAddDish(e) {
    e.preventDefault();
    const { error } = await supabase.from('menu_items').insert([{
      name: newName,
      price: parseFloat(newPrice),
      available_date: selectedDate,
      max_quantity: parseInt(newMaxQty) || null,
      is_published: false,
    }]);

    if (!error) {
      toast.success('Danie dodane do menu.');
      setNewName('');
      setNewPrice('');
      setNewMaxQty('');
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
      .select('id, name, price, available_date, max_quantity')
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
      max_quantity: dish.max_quantity,
      available_date: selectedDate,
      is_published: false,
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
      .map(d => ({
        name: d.name,
        price: d.price,
        max_quantity: d.max_quantity,
        available_date: selectedDate,
        is_published: false,
      }));
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

  const handleExportCSV = () => {
    const headers = ['Zmiana', 'Firma', 'Pracownik', 'Danie'];
    const rows = activeOrders.map(o => [`ZM ${o.shift}`, o.company, o.person, o.dishes]);
    const csv = '﻿' + [headers, ...rows]
      .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zamowienia_${selectedDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
              <button onClick={() => setActiveTab('faktury')} className={`flex-1 px-4 py-2.5 rounded-xl font-bold text-sm transition-all duration-300 ${activeTab === 'faktury' ? 'bg-white shadow-md text-emerald-600 scale-105' : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'}`}>🧾 Faktury</button>
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
                    <DatePicker
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
                      <input type="number" step="0.01" required value={newPrice} onChange={e => setNewPrice(e.target.value)} placeholder="Cena (zł)" className="w-1/3 p-4 bg-white/60 border border-slate-200/50 rounded-2xl outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 font-bold transition-all backdrop-blur-sm" />
                      <input type="number" value={newMaxQty} onChange={e => setNewMaxQty(e.target.value)} placeholder="Limit (opcj.)" className="w-1/3 p-4 bg-white/60 border border-slate-200/50 rounded-2xl outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 font-bold transition-all backdrop-blur-sm" />
                      <button type="submit" className="w-1/3 bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-black rounded-2xl hover:from-blue-700 hover:to-indigo-700 transition-all shadow-[0_4px_14px_0_rgba(79,70,229,0.39)] hover:shadow-[0_6px_20px_rgba(79,70,229,0.23)] active:scale-95">DODAJ</button>
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
                          <button type="button" onClick={() => setCopyCalOffset(p => p + 1)} disabled={copyCalOffset >= 0} className="shrink-0 w-8 h-8 flex items-center justify-center rounded-xl bg-white/60 border border-slate-200/50 hover:bg-white hover:shadow-md text-slate-600 font-black text-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed">›</button>
                          <div className="relative shrink-0">
                            <button ref={copyDatePickerBtnRef} type="button" onClick={(e) => { e.stopPropagation(); if (!showCopyDatePicker) { const rect = copyDatePickerBtnRef.current.getBoundingClientRect(); const left = Math.max(4, Math.min(rect.right - 288, window.innerWidth - 292)); setCopyPickerPos({ top: rect.bottom + 8, left }); } setShowCopyDatePicker(p => !p); }} className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/60 border border-slate-200 hover:bg-white hover:shadow-sm transition-all text-base backdrop-blur-sm" title="Wybierz datę">📅</button>
                            {showCopyDatePicker && (
                              <DatePicker year={copyPickerYear} month={copyPickerMonth} selectedDate={copySourceDate} pos={copyPickerPos} onClose={() => setShowCopyDatePicker(false)} onSelectDate={(d) => { setCopySourceDate(d); setCopyCalOffset(getDayDiff(d)); setShowCopyDatePicker(false); }} onPrevMonth={() => copyPickerMonth === 0 ? (setCopyPickerYear(y => y - 1), setCopyPickerMonth(11)) : setCopyPickerMonth(m => m - 1)} onNextMonth={() => copyPickerMonth === 11 ? (setCopyPickerYear(y => y + 1), setCopyPickerMonth(0)) : setCopyPickerMonth(m => m + 1)} onPrevYear={() => setCopyPickerYear(y => y - 1)} onNextYear={() => setCopyPickerYear(y => y + 1)} />
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
                  {(() => {
                    const unpublishedCount = dailyMenu.filter(i => !i.is_published).length;
                    const publishedCount = dailyMenu.filter(i => i.is_published).length;
                    const allPublished = dailyMenu.length > 0 && unpublishedCount === 0;
                    const allUnpublished = dailyMenu.length > 0 && publishedCount === 0;
                    return (
                      <>
                        <div className="flex items-center justify-between mb-5">
                          <h2 className="text-lg font-heading font-black text-slate-800">Menu zaplanowane na ten dzień:</h2>
                          {dailyMenu.length > 0 && (
                            <span className={`text-xs font-black px-3 py-1.5 rounded-full ${allPublished ? 'bg-green-100 text-green-700' : allUnpublished ? 'bg-amber-100 text-amber-700' : 'bg-orange-100 text-orange-700'}`}>
                              {allPublished ? 'OPUBLIKOWANE' : allUnpublished ? 'ROBOCZE' : `${unpublishedCount} ROBOCZE`}
                            </span>
                          )}
                        </div>

                        {dailyMenu.length > 0 && unpublishedCount > 0 && (
                          <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between gap-3">
                            <p className="text-sm text-amber-800 font-semibold">
                              {unpublishedCount === dailyMenu.length
                                ? 'Menu jest robocze — klienci nie widzą żadnych dań.'
                                : `${unpublishedCount} dań jest roboczych i niewidocznych dla klientów.`}
                            </p>
                            <button
                              onClick={handlePublishMenu}
                              disabled={publishing}
                              className="shrink-0 bg-gradient-to-br from-green-500 to-emerald-600 text-white font-black text-sm px-5 py-2.5 rounded-xl shadow-md hover:from-green-600 hover:to-emerald-700 hover:shadow-lg active:scale-95 transition-all disabled:opacity-60"
                            >
                              {publishing ? 'Publikowanie…' : 'Opublikuj menu'}
                            </button>
                          </div>
                        )}

                        {dailyMenu.length > 0 && allPublished && (
                          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-2xl flex items-center justify-between gap-3">
                            <p className="text-sm text-green-800 font-semibold">Menu opublikowane — klienci mogą zamawiać.</p>
                            <button
                              onClick={handleUnpublishMenu}
                              disabled={publishing}
                              className="shrink-0 text-xs font-bold text-slate-600 bg-white border border-slate-200 px-3 py-1.5 rounded-xl hover:bg-slate-50 transition-all disabled:opacity-60"
                            >
                              {publishing ? '…' : 'Cofnij publikację'}
                            </button>
                          </div>
                        )}

                        {dailyMenu.length === 0
                          ? <p className="text-slate-500 italic text-center py-6 bg-white/40 rounded-2xl border border-dashed border-slate-300">Brak dań.</p>
                          : (
                            <ul className="space-y-3">
                              {dailyMenu.map(item => (
                                <li key={item.id} className={`flex justify-between items-center p-4 rounded-2xl border transition-all backdrop-blur-sm hover:shadow-md ${item.is_published ? 'bg-white/60 border-slate-200/50 hover:bg-white' : 'bg-amber-50/60 border-amber-200/50 hover:bg-amber-50'}`}>
                                  <div className="flex items-center gap-3">
                                    {!item.is_published && (
                                      <span className="text-[10px] font-black bg-amber-200 text-amber-800 px-2 py-0.5 rounded-md uppercase tracking-wide">Roboczy</span>
                                    )}
                                    <div>
                                      <p className="font-bold text-slate-800">{item.name}</p>
                                      <p className="text-indigo-600 font-black text-sm">{item.price} zł{item.max_quantity ? ` · limit: ${item.max_quantity}` : ''}</p>
                                    </div>
                                  </div>
                                  <button onClick={() => handleDeleteDish(item.id)} className="text-red-500 font-bold text-xs bg-white px-3 py-2 rounded-xl border border-red-100 shadow-sm hover:bg-red-50 hover:border-red-200 transition-all">USUŃ</button>
                                </li>
                              ))}
                            </ul>
                          )
                        }
                      </>
                    );
                  })()}
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
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-5">
                  <h2 className="text-2xl font-heading font-black text-slate-800">Raport dnia: <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-orange-600">{selectedDate}</span></h2>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={handleExportCSV}
                      className="flex items-center gap-1.5 px-4 py-2 bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold text-sm rounded-xl hover:bg-emerald-100 transition-all shadow-sm"
                    >
                      ⬇ CSV
                    </button>
                    <button
                      onClick={() => { fetchProduction(selectedDate); setProdCountdown(60); }}
                      className="flex items-center gap-1.5 px-4 py-2 bg-white/60 border border-slate-200 text-slate-600 font-bold text-sm rounded-xl hover:bg-white transition-all shadow-sm"
                    >
                      🔄 Odśwież <span className="text-xs text-slate-400 font-normal ml-1">({prodCountdown}s)</span>
                    </button>
                  </div>
                </div>

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
                          <div className="flex items-center gap-3 mb-1 flex-wrap">
                            <span className={`text-xs font-bold px-2 py-1 rounded-md ${order.shift === 1 ? 'bg-orange-100 text-orange-700' : 'bg-indigo-100 text-indigo-700'}`}>ZM {order.shift}</span>
                            <span className="font-bold text-slate-800">{order.person}</span>
                            <span className="text-xs text-slate-400">{order.company}</span>
                          </div>
                          <p className="font-black text-slate-700">{order.dishes}</p>
                          <p className="text-[10px] text-slate-400 mt-1">{order.createdAt}</p>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button
                            onClick={() => handleMarkDelivered(order.id)}
                            className="bg-green-50 text-green-700 border border-green-200 px-4 py-2 rounded-xl font-bold text-sm hover:bg-green-100 active:scale-95 transition-all"
                          >
                            ✓ Dostarczone
                          </button>
                          {canCancel(order.shift) && (
                            <button
                              onClick={() => handleCancelOrder(order.id)}
                              className="bg-white text-red-500 border border-red-200 px-4 py-2 rounded-xl font-bold text-sm hover:bg-red-50 active:scale-95 transition-all"
                            >
                              Anuluj
                            </button>
                          )}
                        </div>
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
                              <p className="text-xs text-slate-400">{order.company}</p>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* DOSTARCZONE */}
              {deliveredOrders.length > 0 && (
                <div className="glass p-8 rounded-3xl shadow-lg border border-green-200/60 mt-8">
                  <h3 className="text-xl font-heading font-black text-green-700 mb-6">✓ Dostarczone zamówienia</h3>
                  <div className="overflow-x-auto rounded-2xl border border-green-100 bg-white/40">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-green-50/80 text-slate-600 text-xs uppercase tracking-wider border-b border-green-100">
                          <th className="p-5 font-bold">Zmiana</th>
                          <th className="p-5 font-bold">Zamówienie</th>
                          <th className="p-5 font-bold">Klient</th>
                        </tr>
                      </thead>
                      <tbody>
                        {deliveredOrders.map((order, idx) => (
                          <tr key={idx} className="hover:bg-green-50/40 transition-colors">
                            <td className="p-5">
                              <span className={`font-bold px-3 py-1.5 rounded-lg text-xs ${order.shift === 1 ? 'bg-orange-100 text-orange-700' : 'bg-indigo-100 text-indigo-700'}`}>ZM {order.shift}</span>
                            </td>
                            <td className="p-5 text-sm font-black text-slate-700">{order.dishes}</td>
                            <td className="p-5 text-sm font-medium text-slate-500">
                              <p className="font-bold text-slate-700">{order.person}</p>
                              <p className="text-xs text-slate-400">{order.company}</p>
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
                  
                  <div className="bg-white/60 p-6 rounded-2xl border border-slate-200/50 shadow-sm">
                    <h3 className="text-lg font-bold text-slate-800 mb-4 border-b border-slate-200 pb-2">Dane do faktur (sprzedawca)</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Nazwa restauracji / firmy</label>
                        <input type="text" value={settings.restaurant_name || ''} onChange={(e) => setSettings({...settings, restaurant_name: e.target.value})} placeholder="np. Restauracja Smaczna Zupa Sp. z o.o." className="w-full p-3 rounded-lg border border-slate-200 font-medium bg-white focus:ring-2 focus:ring-blue-500 outline-none text-slate-700" />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">NIP</label>
                          <input type="text" value={settings.restaurant_nip || ''} onChange={(e) => setSettings({...settings, restaurant_nip: e.target.value})} placeholder="000-000-00-00" className="w-full p-3 rounded-lg border border-slate-200 font-medium bg-white focus:ring-2 focus:ring-blue-500 outline-none text-slate-700" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Termin płatności (dni)</label>
                          <input type="number" min="1" max="90" value={settings.invoice_payment_days || 14} onChange={(e) => setSettings({...settings, invoice_payment_days: parseInt(e.target.value) || 14})} className="w-full p-3 rounded-lg border border-slate-200 font-medium bg-white focus:ring-2 focus:ring-blue-500 outline-none text-slate-700" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Adres</label>
                        <input type="text" value={settings.restaurant_address || ''} onChange={(e) => setSettings({...settings, restaurant_address: e.target.value})} placeholder="ul. Przykładowa 1, 00-001 Warszawa" className="w-full p-3 rounded-lg border border-slate-200 font-medium bg-white focus:ring-2 focus:ring-blue-500 outline-none text-slate-700" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Numer rachunku bankowego</label>
                        <input type="text" value={settings.restaurant_bank_account || ''} onChange={(e) => setSettings({...settings, restaurant_bank_account: e.target.value})} placeholder="PL 00 0000 0000 0000 0000 0000 0000" className="w-full p-3 rounded-lg border border-slate-200 font-medium bg-white focus:ring-2 focus:ring-blue-500 outline-none text-slate-700" />
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
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
                      <h2 className="text-3xl font-heading font-black text-slate-800">Podsumowanie <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-500 to-emerald-600">Sprzedaży</span></h2>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => {
                            const [y, m] = statsMonth.split('-').map(Number);
                            const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
                            setStatsMonth(prev);
                          }}
                          className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/60 border border-slate-200 hover:bg-white font-black text-slate-500 text-lg transition-all shadow-sm"
                        >‹</button>
                        <span className="font-bold text-slate-700 text-sm min-w-[120px] text-center">
                          {MONTHS_PL[parseInt(statsMonth.split('-')[1], 10) - 1]} {statsMonth.split('-')[0]}
                        </span>
                        <button
                          onClick={() => {
                            const now = new Date();
                            const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                            const [y, m] = statsMonth.split('-').map(Number);
                            const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
                            if (next <= currentYM) setStatsMonth(next);
                          }}
                          disabled={(() => {
                            const now = new Date();
                            const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                            return statsMonth >= currentYM;
                          })()}
                          className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/60 border border-slate-200 hover:bg-white font-black text-slate-500 text-lg transition-all shadow-sm disabled:opacity-30 disabled:cursor-not-allowed"
                        >›</button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {/* Dziś */}
                      <div className={`bg-white/60 p-6 rounded-2xl border border-slate-200/50 shadow-sm hover:shadow-md hover:bg-white transition-all ${!statsData.isCurrentMonth ? 'opacity-40' : ''}`}>
                        <p className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-2">Dzisiaj</p>
                        {statsData.isCurrentMonth ? (
                          <>
                            <p className="text-4xl font-heading font-black text-slate-800 mb-1">{statsData.today.revenue.toFixed(2)} <span className="text-xl text-slate-400">zł</span></p>
                            <p className="text-green-600 font-bold bg-green-100/80 px-3 py-1 rounded-lg inline-block">{statsData.today.count} sprzedanych porcji</p>
                          </>
                        ) : (
                          <p className="text-slate-400 italic text-sm mt-2">Niedostępne dla poprzednich miesięcy</p>
                        )}
                      </div>

                      {/* Ten tydzień */}
                      <div className={`bg-white/60 p-6 rounded-2xl border border-slate-200/50 shadow-sm hover:shadow-md hover:bg-white transition-all relative overflow-hidden ${!statsData.isCurrentMonth ? 'opacity-40' : ''}`}>
                        <div className="absolute -right-4 -top-4 w-24 h-24 bg-green-100 rounded-full blur-2xl opacity-60 pointer-events-none"></div>
                        <p className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-2 relative z-10">Ostatnie 7 dni</p>
                        {statsData.isCurrentMonth ? (
                          <>
                            <p className="text-4xl font-heading font-black text-slate-800 mb-1 relative z-10">{statsData.week.revenue.toFixed(2)} <span className="text-xl text-slate-400">zł</span></p>
                            <p className="text-green-600 font-bold bg-green-100/80 px-3 py-1 rounded-lg inline-block relative z-10">{statsData.week.count} sprzedanych porcji</p>
                          </>
                        ) : (
                          <p className="text-slate-400 italic text-sm mt-2 relative z-10">Niedostępne dla poprzednich miesięcy</p>
                        )}
                      </div>

                      {/* Miesiąc */}
                      <div className="bg-gradient-to-br from-green-500 to-emerald-600 p-6 rounded-2xl shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all text-white relative overflow-hidden">
                        <div className="absolute -right-10 -top-10 w-40 h-40 bg-white rounded-full mix-blend-overlay filter blur-2xl opacity-20 pointer-events-none"></div>
                        <p className="text-sm font-bold text-green-100 uppercase tracking-widest mb-2 relative z-10">
                          {MONTHS_PL[parseInt(statsMonth.split('-')[1], 10) - 1]} {statsMonth.split('-')[0]}
                        </p>
                        <p className="text-4xl font-heading font-black mb-1 relative z-10">{statsData.month.revenue.toFixed(2)} <span className="text-xl text-green-200">zł</span></p>
                        <p className="text-white font-bold bg-white/20 px-3 py-1 rounded-lg inline-block relative z-10 backdrop-blur-sm">{statsData.month.count} sprzedanych porcji</p>
                      </div>
                    </div>
                  </div>

                  {/* Ranking */}
                  <div className="glass p-8 rounded-3xl shadow-lg border border-slate-200/50">
                    <h2 className="text-2xl font-heading font-black text-slate-800 mb-6 flex items-center gap-2"><span>🏆</span> Top 10 Najchętniej Zamawianych Dań <span className="text-sm text-slate-400 font-medium ml-2">({MONTHS_PL[parseInt(statsMonth.split('-')[1], 10) - 1]} {statsMonth.split('-')[0]})</span></h2>
                    
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
          {/* --- ZAKŁADKA: FAKTURY --- */}
          {activeTab === 'faktury' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">
              {/* Selektor miesiąca */}
              <div className="glass p-6 rounded-3xl shadow-lg border border-slate-200/50">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <h2 className="text-3xl font-heading font-black text-slate-800">Faktury <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-teal-600">VAT</span></h2>
                    <p className="text-sm text-slate-500 mt-1">Faktura przychodowa (FV) i kosztowa (FK) za wybrany miesiąc — 8% VAT, usługa cateringowa</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => { const [y,m]=invoiceMonth.split('-').map(Number); setInvoiceMonth(m===1?`${y-1}-12`:`${y}-${String(m-1).padStart(2,'0')}`); }}
                      className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/60 border border-slate-200 hover:bg-white font-black text-slate-500 text-lg transition-all shadow-sm"
                    >‹</button>
                    <span className="font-bold text-slate-700 text-sm min-w-[120px] text-center">
                      {MONTHS_PL[parseInt(invoiceMonth.split('-')[1],10)-1]} {invoiceMonth.split('-')[0]}
                    </span>
                    <button
                      onClick={() => { const now=new Date(); const cur=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`; const [y,m]=invoiceMonth.split('-').map(Number); const next=m===12?`${y+1}-01`:`${y}-${String(m+1).padStart(2,'0')}`; if(next<=cur) setInvoiceMonth(next); }}
                      disabled={(() => { const now=new Date(); const cur=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`; return invoiceMonth>=cur; })()}
                      className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/60 border border-slate-200 hover:bg-white font-black text-slate-500 text-lg transition-all shadow-sm disabled:opacity-30 disabled:cursor-not-allowed"
                    >›</button>
                  </div>
                </div>
              </div>

              {invoiceLoading ? (
                <div className="py-20 flex justify-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-emerald-500"></div>
                </div>
              ) : !invoiceData ? (
                <div className="glass p-12 rounded-3xl text-center border border-slate-200/50">
                  <p className="text-slate-400 font-medium">Brak danych dla wybranego miesiąca.</p>
                </div>
              ) : (() => {
                const now = new Date();
                const currentYM = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
                const isDraft = invoiceData.yearMonth >= currentYM;
                const [y,m] = invoiceData.yearMonth.split('-').map(Number);
                const daysInMonth = new Date(y, m, 0).getDate();
                const salePeriod = `01.${String(m).padStart(2,'0')}.${y}–${String(daysInMonth).padStart(2,'0')}.${String(m).padStart(2,'0')}.${y}`;
                const fmt = (v) => Number(v).toFixed(2) + ' zł';
                const monthLabel = `${MONTHS_PL[m-1]} ${y}`;

                return (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    {/* FAKTURA PRZYCHODOWA */}
                    <div className="glass rounded-3xl shadow-lg border border-emerald-200/50 overflow-hidden">
                      <div className="bg-gradient-to-r from-emerald-600 to-teal-600 p-5 text-white">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-emerald-100 text-xs font-bold uppercase tracking-wider mb-1">Faktura Przychodowa</p>
                            <p className="text-2xl font-black font-heading">{invoiceNumbers.revenue}</p>
                          </div>
                          {isDraft && <span className="bg-amber-400 text-amber-900 text-[10px] font-black px-2 py-1 rounded-lg uppercase tracking-wide">Projekt</span>}
                        </div>
                        <p className="text-emerald-100 text-xs mt-3">Okres: {salePeriod}</p>
                      </div>
                      <div className="p-5 bg-white/80">
                        {/* Mini invoice body */}
                        <div className="grid grid-cols-2 gap-4 mb-4 text-xs">
                          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                            <p className="text-slate-400 font-bold uppercase tracking-wider mb-1 text-[9px]">Sprzedawca</p>
                            <p className="font-bold text-slate-800">{settings?.restaurant_name || '—'}</p>
                            {settings?.restaurant_nip && <p className="text-slate-500">NIP: {settings.restaurant_nip}</p>}
                          </div>
                          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                            <p className="text-slate-400 font-bold uppercase tracking-wider mb-1 text-[9px]">Nabywca</p>
                            <p className="font-bold text-slate-800">Nabywcy zbiorczy</p>
                            <p className="text-slate-500">{invoiceData.orderCount} zamówień</p>
                          </div>
                        </div>
                        <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden mb-4">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-slate-800 text-white">
                                <th className="text-left p-2 font-bold">Usługa</th>
                                <th className="text-right p-2 font-bold">Ilość</th>
                                <th className="text-right p-2 font-bold">VAT</th>
                                <th className="text-right p-2 font-bold">Brutto</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                <td className="p-2 font-medium text-slate-700">Usługa cateringowa — {monthLabel}</td>
                                <td className="p-2 text-right text-slate-600">{invoiceData.revenue.meals} porcji</td>
                                <td className="p-2 text-right text-slate-600">8%</td>
                                <td className="p-2 text-right font-black text-slate-800">{fmt(invoiceData.revenue.gross)}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                        <div className="space-y-1 text-xs mb-4">
                          <div className="flex justify-between text-slate-500"><span>Razem netto:</span><span className="font-medium">{fmt(invoiceData.revenue.net)}</span></div>
                          <div className="flex justify-between text-slate-500"><span>VAT 8%:</span><span className="font-medium">{fmt(invoiceData.revenue.vat)}</span></div>
                          <div className="flex justify-between text-emerald-700 font-black text-sm border-t border-slate-200 pt-1 mt-1"><span>RAZEM BRUTTO:</span><span>{fmt(invoiceData.revenue.gross)}</span></div>
                        </div>
                        <button
                          onClick={() => printInvoice('revenue')}
                          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 text-sm"
                        >
                          <span>📥</span> Pobierz PDF (Drukuj)
                        </button>
                      </div>
                    </div>

                    {/* FAKTURA KOSZTOWA */}
                    <div className="glass rounded-3xl shadow-lg border border-orange-200/50 overflow-hidden">
                      <div className="bg-gradient-to-r from-orange-500 to-amber-600 p-5 text-white">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-orange-100 text-xs font-bold uppercase tracking-wider mb-1">Faktura Kosztowa — Pracodawcy</p>
                            <p className="text-2xl font-black font-heading">{invoiceNumbers.cost}</p>
                          </div>
                          {isDraft && <span className="bg-amber-400 text-amber-900 text-[10px] font-black px-2 py-1 rounded-lg uppercase tracking-wide">Projekt</span>}
                        </div>
                        <p className="text-orange-100 text-xs mt-3">Okres: {salePeriod}</p>
                      </div>
                      <div className="p-5 bg-white/80">
                        <div className="grid grid-cols-2 gap-4 mb-4 text-xs">
                          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                            <p className="text-slate-400 font-bold uppercase tracking-wider mb-1 text-[9px]">Sprzedawca</p>
                            <p className="font-bold text-slate-800">{settings?.restaurant_name || '—'}</p>
                            {settings?.restaurant_nip && <p className="text-slate-500">NIP: {settings.restaurant_nip}</p>}
                          </div>
                          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                            <p className="text-slate-400 font-bold uppercase tracking-wider mb-1 text-[9px]">Nabywca</p>
                            <p className="font-bold text-slate-800">Pracodawcy zbiorczy</p>
                            <p className="text-slate-500">{invoiceData.cost.companies.length} firm</p>
                          </div>
                        </div>
                        <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden mb-4">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-slate-800 text-white">
                                <th className="text-left p-2 font-bold">Firma</th>
                                <th className="text-right p-2 font-bold">Porcji</th>
                                <th className="text-right p-2 font-bold">VAT</th>
                                <th className="text-right p-2 font-bold">Brutto</th>
                              </tr>
                            </thead>
                            <tbody>
                              {invoiceData.cost.companies.length === 0 ? (
                                <tr><td colSpan={4} className="p-3 text-center text-slate-400">Brak dopłat pracodawcy w tym miesiącu</td></tr>
                              ) : invoiceData.cost.companies.map((c, i) => (
                                <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                                  <td className="p-2 font-medium text-slate-700 truncate max-w-[120px]">{c.name}</td>
                                  <td className="p-2 text-right text-slate-600">{c.meals}</td>
                                  <td className="p-2 text-right text-slate-600">8%</td>
                                  <td className="p-2 text-right font-black text-slate-800">{fmt(c.gross)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="space-y-1 text-xs mb-4">
                          <div className="flex justify-between text-slate-500"><span>Razem netto:</span><span className="font-medium">{fmt(invoiceData.cost.net)}</span></div>
                          <div className="flex justify-between text-slate-500"><span>VAT 8%:</span><span className="font-medium">{fmt(invoiceData.cost.vat)}</span></div>
                          <div className="flex justify-between text-orange-700 font-black text-sm border-t border-slate-200 pt-1 mt-1"><span>RAZEM BRUTTO:</span><span>{fmt(invoiceData.cost.gross)}</span></div>
                        </div>
                        <button
                          onClick={() => printInvoice('cost')}
                          disabled={invoiceData.cost.companies.length === 0}
                          className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <span>📥</span> Pobierz PDF (Drukuj)
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Legenda */}
              {invoiceData && (
                <div className="glass p-5 rounded-2xl border border-slate-200/50 text-sm text-slate-500">
                  <p><strong className="text-slate-700">FV (Przychodowa)</strong> — łączny przychód restauracji ze sprzedaży posiłków (wpłaty pracowników + dopłaty pracodawców).</p>
                  <p className="mt-1"><strong className="text-slate-700">FK (Kosztowa)</strong> — zestawienie dopłat pracodawców do posiłków pracowniczych, z podziałem na firmy. Służy pracodawcom jako dokument kosztowy.</p>
                  <p className="mt-1 text-xs">Oznaczenie <strong>PROJEKT</strong> znika automatycznie po zakończeniu miesiąca. Stawka VAT: 8% (usługi gastronomiczne). Kliknięcie "Pobierz PDF" otwiera fakturę do druku — w oknie drukowania wybierz "Zapisz jako PDF".</p>
                </div>
              )}
            </div>
          )}

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
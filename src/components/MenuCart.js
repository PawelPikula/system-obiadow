"use client";
import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';

const MONTHS_PL = ['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec','Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień'];
const DAYS_SHORT = ['Pn','Wt','Śr','Cz','Pt','So','Nd'];

function getLocalToday() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw' }).format(new Date());
}

function getDaysWindow(offset) {
  const dayNames = ['Niedz', 'Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob'];
  const todayStr = getLocalToday();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + offset + i);
    const localDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw' }).format(d);
    return {
      date: localDate,
      name: localDate === todayStr ? 'Dziś' : dayNames[d.getDay()],
      dayNum: d.getDate(),
    };
  });
}

function getMonthGrid(year, month) {
  const firstDay = new Date(year, month, 1).getDay();
  const startPad = firstDay === 0 ? 6 : firstDay - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return { startPad, daysInMonth };
}

function DatePickerDropdown({ year, month, selectedDate, onSelectDate, onPrevMonth, onNextMonth, onPrevYear, onNextYear, pos, onClose }) {
  const { startPad, daysInMonth } = getMonthGrid(year, month);
  const today = getLocalToday();
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
          const isPast = dateStr < today;
          return (
            <button
              key={day}
              type="button"
              onClick={() => { if (!isPast) onSelectDate(dateStr); }}
              className={`p-1.5 text-sm rounded-xl font-bold transition-all ${
                isSel ? 'bg-blue-600 text-white' :
                isPast ? 'text-slate-300 cursor-default' :
                'hover:bg-slate-100 text-slate-700'
              }`}
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

export default function MenuCart({ userProfile }) {
  const [allItems, setAllItems] = useState([]);
  const [cart, setCart] = useState({});
  const [selectedShift, setSelectedShift] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(null);
  const [submitError, setSubmitError] = useState('');
  const [settings, setSettings] = useState(null);

  const [selectedDate, setSelectedDate] = useState(() => getLocalToday());
  const [calendarOffset, setCalendarOffset] = useState(0);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickerYear, setPickerYear] = useState(() => new Date().getFullYear());
  const [pickerMonth, setPickerMonth] = useState(() => new Date().getMonth());
  const [pickerPos, setPickerPos] = useState(null);
  const datePickerBtnRef = useRef(null);

  const availableDays = useMemo(() => getDaysWindow(calendarOffset), [calendarOffset]);

  // Fetch menu whenever the 7-day window changes
  useEffect(() => {
    async function fetchMenu() {
      const days = getDaysWindow(calendarOffset);
      const [{ data }, { data: settingsData }] = await Promise.all([
        supabase
          .from('menu_items')
          .select('id, name, price, available_date')
          .gte('available_date', days[0].date)
          .lte('available_date', days[6].date),
        supabase.from('system_settings').select('*').eq('id', 1).single(),
      ]);
      setAllItems(data || []);
      if (settingsData) setSettings(settingsData);
    }
    fetchMenu();
  }, [calendarOffset]);

  // Reset cart when date changes
  useEffect(() => {
    setCart({});
    setSubmitError('');
    setOrderSuccess(null);
  }, [selectedDate]);

  const filteredItems = allItems.filter((item) => item.available_date === selectedDate);

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
      const items = Object.entries(cart).map(([itemId, quantity]) => ({ menu_item_id: itemId, quantity }));
      const { data: orderId, error } = await supabase.rpc('create_order', {
        p_delivery_date: selectedDate,
        p_shift: selectedShift,
        p_items: items,
      });
      if (error) throw error;
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

  const isOrderAllowed = () => {
    if (!settings) return false;
    const now = new Date();
    const todayStr = getLocalToday();
    const isPrevDay = selectedShift === 1 ? settings.order_cutoff_shift1_prev_day : settings.order_cutoff_shift2_prev_day;
    const cutoffTime = selectedShift === 1 ? settings.order_cutoff_shift1 : settings.order_cutoff_shift2;
    const deliveryDateObj = new Date(selectedDate);
    if (isPrevDay) deliveryDateObj.setDate(deliveryDateObj.getDate() - 1);
    const cutoffDateStr = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw' }).format(deliveryDateObj);
    if (cutoffDateStr > todayStr) return true;
    if (cutoffDateStr < todayStr) return false;
    const getHourFloat = (timeStr) => {
      if (!timeStr) return 0;
      const [h, m] = timeStr.split(':').map(Number);
      return h + (m || 0) / 60;
    };
    const currentHour = now.getHours() + now.getMinutes() / 60;
    return currentHour < getHourFloat(cutoffTime);
  };

  const canOrder = isOrderAllowed();

  const handleSelectDate = (date) => {
    setSelectedDate(date);
    // Snap calendar window to show the selected week
    const todayMs = new Date(); todayMs.setHours(0, 0, 0, 0);
    const [y, m, d] = date.split('-').map(Number);
    const diff = Math.round((new Date(y, m - 1, d) - todayMs) / 86400000);
    setCalendarOffset(Math.max(0, Math.floor(diff / 7) * 7));
    setShowDatePicker(false);
  };

  return (
    <div className="glass text-slate-800 rounded-[2rem] p-6 max-w-md w-full animate-fade-in" style={{ animationDelay: '0.1s' }}>
      {showDatePicker && (
        <DatePickerDropdown
          year={pickerYear}
          month={pickerMonth}
          selectedDate={selectedDate}
          onSelectDate={handleSelectDate}
          onPrevMonth={() => { if (pickerMonth === 0) { setPickerMonth(11); setPickerYear(y => y - 1); } else setPickerMonth(m => m - 1); }}
          onNextMonth={() => { if (pickerMonth === 11) { setPickerMonth(0); setPickerYear(y => y + 1); } else setPickerMonth(m => m + 1); }}
          onPrevYear={() => setPickerYear(y => y - 1)}
          onNextYear={() => setPickerYear(y => y + 1)}
          pos={pickerPos}
          onClose={() => setShowDatePicker(false)}
        />
      )}

      {/* PASEK WYBORU DNIA */}
      <div className="mb-8">
        <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">
          Wybierz dzień dostawy
        </label>
        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={() => setCalendarOffset((o) => Math.max(0, o - 7))}
            disabled={calendarOffset === 0}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/60 border border-slate-200/50 text-slate-500 font-black hover:bg-white hover:shadow-md transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ‹
          </button>
          <div
            className="flex gap-2 overflow-x-auto flex-1 scrollbar-hide"
            style={{ msOverflowStyle: 'none', scrollbarWidth: 'none' }}
          >
            {availableDays.map((day) => {
              const isSelected = selectedDate === day.date;
              return (
                <button
                  key={day.date}
                  onClick={() => setSelectedDate(day.date)}
                  className={`flex flex-col items-center justify-center min-w-[60px] py-3 rounded-2xl transition-all duration-300 ${
                    isSelected
                      ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/30 scale-105'
                      : 'bg-white/60 text-slate-500 hover:bg-white hover:shadow-md border border-slate-200/50 backdrop-blur-sm'
                  }`}
                >
                  <span className={`text-[10px] font-bold uppercase mb-1 tracking-wider ${isSelected ? 'text-blue-100' : 'text-slate-400'}`}>
                    {day.name}
                  </span>
                  <span className="text-xl font-black font-heading leading-none">{day.dayNum}</span>
                </button>
              );
            })}
          </div>
          <button
            onClick={() => setCalendarOffset((o) => o + 7)}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/60 border border-slate-200/50 text-slate-500 font-black hover:bg-white hover:shadow-md transition-all"
          >
            ›
          </button>
        </div>
        <button
          ref={datePickerBtnRef}
          onClick={(e) => {
            e.stopPropagation();
            if (!showDatePicker) {
              const rect = datePickerBtnRef.current.getBoundingClientRect();
              const left = Math.max(4, Math.min(rect.right - 288, window.innerWidth - 292));
              setPickerPos({ top: rect.bottom + 8, left });
            }
            setShowDatePicker((p) => !p);
          }}
          className="w-full py-2 rounded-xl bg-white/50 border border-slate-200/50 text-slate-500 text-xs font-bold hover:bg-white hover:shadow-sm transition-all backdrop-blur-sm"
        >
          📅 Wybierz datę
        </button>
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
        {!canOrder ? (
          <div className="py-10 text-center bg-red-50/50 rounded-3xl border-2 border-dashed border-red-200 backdrop-blur-sm">
            <p className="text-red-500 font-bold mb-2">Czas minął ⏰</p>
            <p className="text-slate-500 font-medium text-sm px-4">
              Nie można już składać zamówień na wybraną datę i zmianę.
              <br />(Limit dla ZM {selectedShift}:{' '}
              {settings
                ? `${settings[`order_cutoff_shift${selectedShift}_prev_day`] ? 'Dzień wcześniej' : 'W dniu dostawy'} ${settings[`order_cutoff_shift${selectedShift}`]?.substring(0, 5)}`
                : '?'})
            </p>
          </div>
        ) : filteredItems.length === 0 ? (
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
                        >-</button>
                        <span className="font-bold w-4 text-center text-slate-800">{cart[key]}</span>
                        <button
                          onClick={() => addToCart(item.id)}
                          className="w-8 h-8 flex items-center justify-center rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm font-bold hover:shadow-md transition-all"
                        >+</button>
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

      {totalAmount > 0 && canOrder && (
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

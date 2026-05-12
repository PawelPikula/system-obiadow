"use client";
import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';

import { getLocalToday, getDaysWindow, getDayDiff } from '../lib/date-utils';
import DatePicker from './Calendar/DatePicker';

const MONTHS_PL = ['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec','Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień'];
const DAYS_SHORT = ['Pn','Wt','Śr','Cz','Pt','So','Nd'];

export default function MenuCart({ userProfile }) {
  const [allItems, setAllItems] = useState([]);
  const [cart, setCart] = useState({});
  const [selectedShift, setSelectedShift] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(null);
  const [submitError, setSubmitError] = useState('');
  const [settings, setSettings] = useState(null);
  // Istniejące zamówienia użytkownika (klucz: "YYYY-MM-DD_shift")
  const [existingOrders, setExistingOrders] = useState({});
  const [subsidyUsedDates, setSubsidyUsedDates] = useState(new Set());
  const [soldCounts, setSoldCounts] = useState({});

  const [selectedDate, setSelectedDate] = useState(() => getLocalToday());
  const [calendarOffset, setCalendarOffset] = useState(0);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickerYear, setPickerYear] = useState(() => new Date().getFullYear());
  const [pickerMonth, setPickerMonth] = useState(() => new Date().getMonth());
  const [pickerPos, setPickerPos] = useState(null);
  const datePickerBtnRef = useRef(null);

  const availableDays = useMemo(() => getDaysWindow(calendarOffset), [calendarOffset]);

  // Fetch menu i istniejące zamówienia gdy okno kalendarza się zmienia
  useEffect(() => {
    async function fetchMenu() {
      const days = getDaysWindow(calendarOffset);
      const from = days[0].date;
      const to = days[6].date;

      const [{ data: menuData }, { data: settingsData }, { data: { session } }, ] = await Promise.all([
        supabase.from('menu_items').select('id, name, price, available_date, max_quantity').gte('available_date', from).lte('available_date', to),
        supabase.from('system_settings').select('*').eq('id', 1).single(),
        supabase.auth.getSession(),
      ]);

      const menuItems = menuData || [];
      setAllItems(menuItems);
      if (settingsData) setSettings(settingsData);

      if (menuItems.length > 0) {
        const { data: soldData } = await supabase
          .from('order_items')
          .select('menu_item_id, quantity, orders!inner(status)')
          .in('menu_item_id', menuItems.map(m => m.id))
          .in('orders.status', ['approved', 'paid_via_blik', 'delivered']);

        const soldMap = {};
        (soldData || []).forEach(si => {
          soldMap[si.menu_item_id] = (soldMap[si.menu_item_id] || 0) + si.quantity;
        });
        setSoldCounts(soldMap);
      }

      if (session) {
        const { data: ordersData } = await supabase
          .from('orders')
          .select('delivery_date, shift, employer_paid, status')
          .eq('profile_id', session.user.id)
          .gte('delivery_date', from)
          .lte('delivery_date', to)
          .not('status', 'in', '("cancelled","refunded")');

        const map = {};
        const usedDates = new Set();
        (ordersData || []).forEach(o => {
          map[`${o.delivery_date}_${o.shift}`] = true;
          if (o.employer_paid > 0) usedDates.add(o.delivery_date);
        });
        setExistingOrders(map);
        setSubsidyUsedDates(usedDates);
      }
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
  const rawSubsidy = userProfile?.companies?.daily_subsidy || 0;
  const [selY, selM, selD] = selectedDate.split('-').map(Number);
  const isWeekend = [0, 6].includes(new Date(selY, selM - 1, selD).getDay());
  const subsidyAlreadyUsed = subsidyUsedDates.has(selectedDate);
  const effectiveSubsidy = (!isWeekend && !subsidyAlreadyUsed) ? rawSubsidy : 0;
  const toPay = Math.max(totalAmount - effectiveSubsidy, 0);

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
      setExistingOrders(prev => ({ ...prev, [`${selectedDate}_${selectedShift}`]: true }));
      if (created?.employer_paid > 0) {
        setSubsidyUsedDates(prev => new Set([...prev, selectedDate]));
      }
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
    const todayStr = getLocalToday();
    const [tY, tM, tD] = todayStr.split('-').map(Number);
    const todayStart = new Date(tY, tM - 1, tD);
    
    const [y, m, d] = date.split('-').map(Number);
    const selectedStart = new Date(y, m - 1, d);
    
    const diff = Math.round((selectedStart - todayStart) / 86400000);
    setCalendarOffset(Math.max(0, Math.floor(diff / 7) * 7));
    setShowDatePicker(false);
  };

  return (
    <div className="glass text-slate-800 rounded-[2rem] p-6 max-w-md w-full animate-fade-in" style={{ animationDelay: '0.1s' }}>
      {showDatePicker && (
        <DatePicker
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
              const hasOrder = existingOrders[`${day.date}_1`] || existingOrders[`${day.date}_2`];
              return (
                <button
                  key={day.date}
                  onClick={() => setSelectedDate(day.date)}
                  className={`relative flex flex-col items-center justify-center min-w-[60px] py-3 rounded-2xl transition-all duration-300 ${
                    isSelected
                      ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/30 scale-105'
                      : 'bg-white/60 text-slate-500 hover:bg-white hover:shadow-md border border-slate-200/50 backdrop-blur-sm'
                  }`}
                >
                  {hasOrder && (
                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white shadow-sm" title="Masz zamówienie" />
                  )}
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
          {[1, 2].map((shift) => {
            const alreadyOrdered = existingOrders[`${selectedDate}_${shift}`];
            return (
              <button
                key={shift}
                onClick={() => setSelectedShift(shift)}
                className={`relative flex-1 py-3 rounded-xl font-bold transition-all duration-300 text-sm ${
                  selectedShift === shift
                    ? 'bg-white text-blue-600 shadow-md'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
                }`}
              >
                {alreadyOrdered && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-slate-200" />
                )}
                {shift} Zmiana
              </button>
            );
          })}
        </div>
        {existingOrders[`${selectedDate}_${selectedShift}`] && (
          <p className="mt-2 text-xs font-bold text-green-700 bg-green-50 border border-green-200 px-3 py-2 rounded-xl">
            ✓ Masz już zamówienie na ten dzień i zmianę. Możesz złożyć kolejne.
          </p>
        )}
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
                    <div className="flex items-center gap-2">
                      <p className="text-indigo-600 font-black text-sm">{item.price} zł</p>
                      {item.max_quantity && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                          (soldCounts[item.id] || 0) >= item.max_quantity 
                            ? 'bg-red-100 text-red-600' 
                            : 'bg-slate-100 text-slate-500'
                        }`}>
                          {(soldCounts[item.id] || 0)} / {item.max_quantity}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 bg-slate-50 p-1.5 rounded-2xl border border-slate-100">
                    {item.max_quantity && (soldCounts[item.id] || 0) >= item.max_quantity && !inCart ? (
                      <span className="px-4 py-2 text-xs font-bold text-red-500 bg-red-50 rounded-xl">Wyprzedane</span>
                    ) : inCart ? (
                      <>
                        <button
                          onClick={() => removeFromCart(item.id)}
                          className="w-8 h-8 flex items-center justify-center rounded-xl bg-white text-slate-600 shadow-sm border border-slate-200 font-bold hover:text-red-500 hover:border-red-200 transition-colors"
                        >-</button>
                        <span className="font-bold w-4 text-center text-slate-800">{cart[key]}</span>
                        <button
                          onClick={() => {
                            if (item.max_quantity && (soldCounts[item.id] || 0) + cart[key] >= item.max_quantity) {
                              toast.error('Osiągnięto limit dla tego dania.');
                              return;
                            }
                            addToCart(item.id);
                          }}
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
              {rawSubsidy > 0 && effectiveSubsidy > 0 && (
                <p className="text-xs text-green-700 font-semibold mt-1">
                  Dofinansowanie pracodawcy: -{effectiveSubsidy.toFixed(2)} zł
                </p>
              )}
              {rawSubsidy > 0 && effectiveSubsidy === 0 && (
                <p className="text-xs text-slate-400 font-semibold mt-1">
                  {isWeekend ? 'Weekend – brak dofinansowania' : 'Dofinansowanie już wykorzystane dziś'}
                </p>
              )}
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

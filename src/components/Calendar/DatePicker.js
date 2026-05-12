"use client";
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getLocalToday, getMonthGrid } from '../../lib/date-utils';

const MONTHS_PL = ['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec','Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień'];
const DAYS_SHORT = ['Pn','Wt','Śr','Cz','Pt','So','Nd'];

export default function DatePicker({ year, month, selectedDate, onSelectDate, onPrevMonth, onNextMonth, onPrevYear, onNextYear, pos, onClose }) {
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

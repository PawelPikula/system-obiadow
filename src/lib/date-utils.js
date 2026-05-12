export function getLocalToday() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw' }).format(new Date());
}

export function getDaysWindow(offset) {
  const dayNames = ['Niedz','Pon','Wt','Śr','Czw','Pt','Sob'];
  const todayStr = getLocalToday();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + offset + i);
    const localDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw' }).format(d);
    return { date: localDate, name: localDate === todayStr ? 'Dziś' : dayNames[d.getDay()], dayNum: d.getDate() };
  });
}

export function getMonthGrid(year, month) {
  const firstDay = new Date(year, month, 1).getDay();
  const startPad = firstDay === 0 ? 6 : firstDay - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return { startPad, daysInMonth };
}

export function getDayDiff(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const todayStr = getLocalToday();
  const [tY, tM, tD] = todayStr.split('-').map(Number);
  const today = new Date(tY, tM - 1, tD);
  return Math.round((new Date(y, m - 1, d) - today) / 86400000);
}

import React, { createContext, useContext, useState } from 'react';

export const ALL_MONTHS = [
  'Apr 23','May 23','Jun 23','Jul 23','Aug 23','Sep 23','Oct 23','Nov 23','Dec 23',
  'Jan 24','Feb 24','Mar 24','Apr 24','May 24','Jun 24','Jul 24','Aug 24','Sep 24','Oct 24','Nov 24','Dec 24',
  'Jan 25','Feb 25','Mar 25','Apr 25','May 25','Jun 25','Jul 25','Aug 25','Sep 25','Oct 25','Nov 25','Dec 25',
  'Jan 26','Feb 26','Mar 26',
];

// Normalize "Apr'23", "Apr 2023", "Apr 23" → "Apr 23"
export function normMonth(s) {
  if (!s) return '';
  return String(s)
    .replace("'", ' ')
    .replace(/([A-Za-z]+)\s+(\d{4})/, (_, m, y) => `${m} ${y.slice(2)}`);
}

// Returns { start, end } indices into the dates array for the given range
export function getSliceRange(dates, fromMonth, toMonth) {
  const fromIdx = ALL_MONTHS.indexOf(normMonth(fromMonth));
  const toIdx   = ALL_MONTHS.indexOf(normMonth(toMonth));
  let start = 0, end = dates.length - 1;
  for (let i = 0; i < dates.length; i++) {
    if (ALL_MONTHS.indexOf(normMonth(dates[i])) >= fromIdx) { start = i; break; }
  }
  for (let i = dates.length - 1; i >= 0; i--) {
    if (ALL_MONTHS.indexOf(normMonth(dates[i])) <= toIdx) { end = i; break; }
  }
  return { start, end };
}

const DateRangeContext = createContext(null);

export function DateRangeProvider({ children }) {
  const [fromMonth, setFromMonth] = useState('Apr 23');
  const [toMonth,   setToMonth]   = useState('Mar 26');
  return (
    <DateRangeContext.Provider value={{ fromMonth, setFromMonth, toMonth, setToMonth }}>
      {children}
    </DateRangeContext.Provider>
  );
}

export function useDateRange() {
  return useContext(DateRangeContext);
}

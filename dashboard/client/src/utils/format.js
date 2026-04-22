/**
 * Format numbers in Indian numbering system (lakhs/crores)
 */
export function fmtINR(n, short = false) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (short) {
    if (abs >= 10000000) return `${sign}₹${(abs / 10000000).toFixed(2)}Cr`;
    if (abs >= 100000) return `${sign}₹${(abs / 100000).toFixed(2)}L`;
    if (abs >= 1000) return `${sign}₹${(abs / 1000).toFixed(1)}K`;
    return `${sign}₹${abs.toFixed(0)}`;
  }
  if (abs >= 10000000) return `${sign}₹${(abs / 10000000).toFixed(2)} Cr`;
  if (abs >= 100000) return `${sign}₹${(abs / 100000).toFixed(2)} L`;
  return `${sign}₹${abs.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

export function fmtPercent(n, decimals = 1) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(decimals)}%`;
}

export function fmtCount(n) {
  if (!n && n !== 0) return '—';
  return n.toLocaleString('en-IN');
}

export function getChangeColor(n) {
  if (n > 0) return 'text-bloomberg-green';
  if (n < 0) return 'text-bloomberg-red';
  return 'text-bloomberg-muted';
}

export function getChangeBg(n) {
  if (n > 0) return 'bg-bloomberg-green/10 text-bloomberg-green';
  if (n < 0) return 'bg-bloomberg-red/10 text-bloomberg-red';
  return 'bg-bloomberg-muted/10 text-bloomberg-muted';
}

export function shortMonthName(yyyy_mm) {
  if (!yyyy_mm) return '';
  const [year, mon] = yyyy_mm.split('-');
  return new Date(year, parseInt(mon) - 1, 1)
    .toLocaleString('en-IN', { month: 'short' });
}

export const CHART_COLORS = {
  inflow: '#22c55e',
  outflow: '#ef4444',
  net: '#f59e0b',
  operating: '#3b82f6',
  investing: '#a855f7',
  financing: '#06b6d4',
  companies: ['#f59e0b', '#3b82f6', '#22c55e', '#a855f7', '#ef4444', '#06b6d4'],
};

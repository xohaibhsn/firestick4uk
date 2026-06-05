/**
 * Returns the last COMPLETED month in 'YYYY-MM' format.
 * June 5 2026  → '2026-05'
 * July 1 2026  → '2026-06'
 * Jan  1 2027  → '2026-12'
 */
export function getLastCompletedMonthYear(): string {
  const now   = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth(); // 0-indexed → this IS the previous month (1-indexed)

  if (month === 0) {
    return `${year - 1}-12`;
  }
  return `${year}-${String(month).padStart(2, '0')}`;
}

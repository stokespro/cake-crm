// Date utility functions

// Check if a date is today
export function isToday(date: Date | null): boolean {
  if (!date) return false;
  const today = new Date();
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

// Get the next business day (skips Saturday and Sunday)
export function getNextBusinessDay(fromDate: Date = new Date()): Date {
  const nextDay = new Date(fromDate);
  nextDay.setDate(nextDay.getDate() + 1);

  // Skip weekends: 0 = Sunday, 6 = Saturday
  const dayOfWeek = nextDay.getDay();
  if (dayOfWeek === 6) {
    // Saturday -> Monday (add 2 days)
    nextDay.setDate(nextDay.getDate() + 2);
  } else if (dayOfWeek === 0) {
    // Sunday -> Monday (add 1 day)
    nextDay.setDate(nextDay.getDate() + 1);
  }

  return nextDay;
}

// Check if a date is the next business day (tomorrow, but skips weekends)
// Friday -> Monday, Saturday -> Monday, Sunday -> Monday
export function isTomorrow(date: Date | null): boolean {
  if (!date) return false;
  const nextBusinessDay = getNextBusinessDay();
  nextBusinessDay.setHours(0, 0, 0, 0);

  const targetDate = new Date(date);
  targetDate.setHours(0, 0, 0, 0);

  return targetDate.getTime() === nextBusinessDay.getTime();
}

// Check if a date is within N days from today (inclusive)
export function isWithinDays(date: Date | null, days: number): boolean {
  if (!date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const targetDate = new Date(date);
  targetDate.setHours(0, 0, 0, 0);

  const diffTime = targetDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays >= 0 && diffDays <= days;
}

// Format date for display
export function formatDate(date: Date | null): string {
  if (!date) return '—';

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const targetDate = new Date(date);
  targetDate.setHours(0, 0, 0, 0);

  if (targetDate.getTime() === today.getTime()) {
    return 'Today';
  }

  // Check if it's the next business day
  const nextBusinessDay = getNextBusinessDay();
  nextBusinessDay.setHours(0, 0, 0, 0);
  if (targetDate.getTime() === nextBusinessDay.getTime()) {
    // On Friday, show "Monday" instead of "Tomorrow"
    const todayDayOfWeek = today.getDay();
    if (todayDayOfWeek === 5 || todayDayOfWeek === 6 || todayDayOfWeek === 0) {
      return 'Monday';
    }
    return 'Tomorrow';
  }

  // Format as M/D
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

// Format time for display (12-hour format)
export function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

// Calculate days until date (negative if past)
export function daysUntil(date: Date | null): number | null {
  if (!date) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const targetDate = new Date(date);
  targetDate.setHours(0, 0, 0, 0);

  const diffTime = targetDate.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// Get display name for task type
export function getTaskTypeName(type: 'FILL' | 'CASE'): string {
  return type === 'FILL' ? 'Fill' : 'Case';
}

// Get priority tier display name
export function getPriorityName(priority: 'URGENT' | 'TOMORROW' | 'UPCOMING' | 'BACKFILL'): string {
  return priority;
}

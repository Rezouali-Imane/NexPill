import { useEffect, useState } from 'react';
import { toISODate } from './time';

/** Current time, refreshed every minute (keeps greeting and "today" correct across midnight). */
export function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return { now, today: toISODate(now) };
}

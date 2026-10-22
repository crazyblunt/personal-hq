import { create } from 'zustand';
import { toDateKey } from '../lib/dates';
import { tickFocus } from './focus';

/** One shared ticker. Components select the precision they need, so most re-render once a minute or once a day. */
export const useClock = create<{ now: number }>(() => ({ now: Date.now() }));

let timer: ReturnType<typeof setInterval> | undefined;

export function startClock() {
  clearInterval(timer);
  timer = setInterval(() => {
    const now = Date.now();
    useClock.setState({ now });
    tickFocus(now);
  }, 1000);
  return () => clearInterval(timer);
}

export const useToday = () => useClock((s) => toDateKey(new Date(s.now)));
export const useMinuteNow = () => useClock((s) => Math.floor(s.now / 60_000) * 60_000);
export const useNow = () => useClock((s) => s.now);

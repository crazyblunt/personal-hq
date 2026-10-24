import { useEffect, useState } from 'react';

/** Width at which My Day switches from one stacked column to the 12-column grid. */
export const WIDE_QUERY = '(min-width: 1024px)';

const query = (q: string) => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(q) : null);

/** True while the media query matches. False where `matchMedia` doesn't exist. */
export function useMediaQuery(q: string): boolean {
  const [matches, setMatches] = useState(() => query(q)?.matches ?? false);
  useEffect(() => {
    const mq = query(q);
    if (!mq) return;
    const update = () => setMatches(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, [q]);
  return matches;
}

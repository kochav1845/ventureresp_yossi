import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Per-route scroll memory.
 *
 * Remembers the window scroll position for each route (tab) and restores it
 * when you navigate back to that route. First-time visits go to the top.
 *
 * The store is module-level so positions survive the unmount/remount of page
 * components as you switch tabs (it resets on a full page reload, which is the
 * desired behavior). Call this once from a component that stays mounted across
 * route changes (Layout).
 */
const scrollPositions = new Map<string, number>();

export function useScrollRestoration() {
  const location = useLocation();
  const key = location.pathname + location.search;

  // Continuously record the current route's scroll position.
  useEffect(() => {
    const handleScroll = () => {
      scrollPositions.set(key, window.scrollY);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [key]);

  // On route change, restore the saved position (retrying while async content loads).
  useEffect(() => {
    const saved = scrollPositions.get(key) ?? 0;

    // Fresh visit → start at the top.
    if (saved === 0) {
      window.scrollTo(0, 0);
      return;
    }

    let frame = 0;
    let attempts = 0;
    const maxAttempts = 60; // ~1s worth of frames, covers async data fetches

    const restore = () => {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      // Only restore once the page has grown tall enough to reach the target.
      if (maxScroll >= saved - 1) {
        window.scrollTo(0, saved);
        if (Math.abs(window.scrollY - saved) <= 2) return;
      }
      attempts += 1;
      if (attempts < maxAttempts) {
        frame = requestAnimationFrame(restore);
      }
    };

    frame = requestAnimationFrame(restore);
    return () => cancelAnimationFrame(frame);
  }, [key]);
}

import { useEffect, useState } from 'react';

// Breakpoints shared with index.css (keep in sync):
//   phone  < 640px   tablet < 900px   laptop >= 900px
export const PHONE_QUERY = '(max-width: 639.98px)';
export const COMPACT_QUERY = '(max-width: 899.98px)';

// True while the media query matches; updates on resize / rotation.
export function useMediaQuery(query) {
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false);
  const [matches, setMatches] = useState(get);

  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

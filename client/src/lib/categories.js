import { useEffect, useState } from 'react';
import { listCategories } from '../services/listings.js';

// Icons and colours per category name. The list of categories itself comes from the server.
const STYLES = {
  Books: { icon: 'book', color: '#5c6bc0' },
  Electronics: { icon: 'laptop', color: '#26a69a' },
  Furniture: { icon: 'chair', color: '#8d6e63' },
  Clothing: { icon: 'shirt', color: '#ab47bc' },
  Sports: { icon: 'ball', color: '#43a047' },
  Stationery: { icon: 'pen', color: '#fb8c00' },
  Other: { icon: 'tag', color: '#78909c' },
};
const FALLBACK = { icon: 'tag', color: '#90a4ae' };

export const categoryStyle = (name) => STYLES[name] ?? FALLBACK;

let cache = null;

/** Loads the category list once per page load and shares it between components. */
export function useCategories(user) {
  const [categories, setCategories] = useState([]);
  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;
    cache ??= listCategories().catch((error) => {
      cache = null;
      throw error;
    });
    cache.then((list) => !cancelled && setCategories(list)).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user]);
  return categories;
}

import { describe, expect, it } from 'vitest';
import { conditionLabel, formatPrice, initials, remainingParts } from '../lib/format.js';

describe('formatting helpers', () => {
  it('formats rupees the Indian way, without needless paise', () => {
    expect(formatPrice(1500)).toBe('₹1,500');
    expect(formatPrice(150000)).toBe('₹1,50,000');
    expect(formatPrice(850.5)).toBe('₹850.50');
  });

  it('splits the time left and reports an ended auction', () => {
    const now = Date.UTC(2026, 10, 16, 12, 0, 0);
    expect(remainingParts(new Date(now + (26 * 3600 + 5 * 60 + 9) * 1000), now)).toEqual({
      ended: false,
      days: 1,
      hours: 2,
      minutes: 5,
      seconds: 9,
    });
    expect(remainingParts(new Date(now - 1000), now).ended).toBe(true);
  });

  it('labels conditions and makes initials', () => {
    expect(conditionLabel('like_new')).toBe('Like new');
    expect(initials('Priya Sharma')).toBe('PS');
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import HeroCarousel from '../components/HeroCarousel.jsx';

const slides = (onClick) => [
  { id: 'a', tone: 'blue', icon: 'book', title: 'First banner', text: 'One', cta: { label: 'Go first', onClick } },
  { id: 'b', tone: 'red', icon: 'gavel', title: 'Second banner', text: 'Two', cta: { label: 'Go second', onClick } },
];

const visibleTitle = () =>
  screen.getAllByRole('group', { hidden: true }).find((g) => g.getAttribute('aria-hidden') === 'false').querySelector('h2').textContent;

describe('HeroCarousel', () => {
  it('moves between banners with the arrows and dots', async () => {
    const user = userEvent.setup();
    render(<HeroCarousel slides={slides(() => {})} />);
    expect(visibleTitle()).toBe('First banner');
    await user.click(screen.getByRole('button', { name: 'Next banner' }));
    expect(visibleTitle()).toBe('Second banner');
    await user.click(screen.getByRole('button', { name: 'Next banner' }));
    expect(visibleTitle()).toBe('First banner'); // Wraps around.
    await user.click(screen.getByRole('button', { name: 'Show banner 2' }));
    expect(visibleTitle()).toBe('Second banner');
    await user.click(screen.getByRole('button', { name: 'Previous banner' }));
    expect(visibleTitle()).toBe('First banner');
  });

  it("runs the visible banner's action", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<HeroCarousel slides={slides(onClick)} />);
    await user.click(screen.getByRole('button', { name: 'Go first' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

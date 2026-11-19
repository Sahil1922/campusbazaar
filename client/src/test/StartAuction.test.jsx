import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const student = { id: 2, name: 'Priya Sharma', roles: ['buyer', 'seller'] };

vi.mock('../auth.jsx', () => ({ useAuth: () => ({ user: student }) }));
vi.mock('../services/listings.js', () => ({ getListing: vi.fn() }));
vi.mock('../services/auctions.js', async (importOriginal) => ({ ...(await importOriginal()), startAuction: vi.fn() }));

const { getListing } = await import('../services/listings.js');
const auctions = await import('../services/auctions.js');
const { default: StartAuction } = await import('../pages/StartAuction.jsx');

const mouse = {
  id: 4,
  sellerId: 2,
  title: 'BESTOR Glide 7 Wireless Mouse',
  price: 120,
  status: 'active',
  condition: 'new',
  category: { id: 2, name: 'Electronics' },
  images: [],
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/listings/4/auction']}>
      <Routes>
        <Route path="/listings/:id/auction" element={<StartAuction />} />
        <Route path="/auctions/:id" element={<p>Auction page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

// The form appears as soon as the listing loads and is pre-filled right after. Waiting for the
// pre-filled value keeps the pre-fill from landing on top of what a test types.
async function prefilledStartingPrice() {
  const field = await screen.findByLabelText('Starting price (₹)');
  await waitFor(() => expect(field).toHaveValue(120));
  return field;
}

describe('suggested bid increment', () => {
  it('is about 5% of the starting price, rounded to a tidy amount', () => {
    expect(auctions.suggestIncrement(120)).toBe('6');
    expect(auctions.suggestIncrement(900)).toBe('45');
    expect(auctions.suggestIncrement(4000)).toBe('200');
    expect(auctions.suggestIncrement(10)).toBe('1');
    expect(auctions.suggestIncrement('')).toBe('');
  });
});

describe('Start auction form (UC-07/UC-08)', () => {
  beforeEach(() => {
    getListing.mockReset();
    getListing.mockResolvedValue(mouse);
    auctions.startAuction.mockReset();
  });

  it('pre-fills the listed price and a suggested increment, and explains how the prices relate', async () => {
    renderPage();
    await prefilledStartingPrice();
    expect(screen.getByLabelText('Bid increment (₹)')).toHaveValue(6);
    expect(screen.getByText(/If nobody bids, the item goes back on sale at ₹120/)).toBeInTheDocument();
  });

  it('updates the suggested increment until the seller types their own', async () => {
    const user = userEvent.setup();
    renderPage();
    const starting = await prefilledStartingPrice();
    const increment = screen.getByLabelText('Bid increment (₹)');
    await user.clear(starting);
    await user.type(starting, '80');
    expect(increment).toHaveValue(4);
    await user.clear(increment);
    await user.type(increment, '10');
    await user.clear(starting);
    await user.type(starting, '100');
    expect(increment).toHaveValue(10);
  });

  it('refuses a starting price above the listed price without contacting the server', async () => {
    const user = userEvent.setup();
    renderPage();
    const starting = await prefilledStartingPrice();
    await user.clear(starting);
    await user.type(starting, '150');
    expect(screen.getByText(/can't be more than your listed price \(₹120\)/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Auction duration'), '24');
    await user.click(screen.getByRole('button', { name: 'Start auction' }));
    expect(screen.getByText('Please correct the highlighted fields.')).toBeInTheDocument();
    expect(auctions.startAuction).not.toHaveBeenCalled();
  });

  it('starts the auction with the chosen values and opens it', async () => {
    const user = userEvent.setup();
    auctions.startAuction.mockResolvedValue({ id: 31 });
    renderPage();
    const starting = await prefilledStartingPrice();
    await user.clear(starting);
    await user.type(starting, '80');
    await user.selectOptions(screen.getByLabelText('Auction duration'), '24');
    await user.click(screen.getByRole('button', { name: 'Start auction' }));
    expect(await screen.findByText('Auction page')).toBeInTheDocument();
    expect(auctions.startAuction).toHaveBeenCalledWith(student, 4, { startingPrice: '80', bidIncrement: '4', durationHours: '24' });
  });
});

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const student = { id: 2, name: 'Priya Sharma', roles: ['buyer', 'seller'] };

vi.mock('../auth.jsx', () => ({ useAuth: () => ({ user: student }) }));
vi.mock('../services/auctions.js', () => ({
  getAuction: vi.fn(),
  placeBid: vi.fn(),
  subscribe: vi.fn(() => () => {}),
}));

const { ApiError } = await import('../api.js');
const auctions = await import('../services/auctions.js');
const { default: AuctionDetail } = await import('../pages/AuctionDetail.jsx');

const inOneHour = () => new Date(Date.now() + 3600 * 1000).toISOString();

const auction = (overrides = {}) => ({
  id: 9,
  status: 'active',
  startingPrice: 1000,
  bidIncrement: 100,
  currentBid: 1000,
  minimumBid: 1100,
  maximumBid: 11000,
  bidCount: 1,
  endTime: inOneHour(),
  isSeller: false,
  isWinner: false,
  iAmHighest: false,
  winnerId: null,
  winnerName: null,
  listing: {
    id: 4,
    title: 'Dell 24" monitor',
    description: 'HDMI cable included.',
    condition: 'good',
    status: 'in_auction',
    category: { id: 2, name: 'Electronics' },
    images: [],
    seller: { id: 1, name: 'Rohan Mehta' },
  },
  bids: [{ id: 1, amount: 1000, placedAt: new Date().toISOString(), isMine: false, bidderName: 'A•••• K••••' }],
  ...overrides,
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/auctions/9']}>
      <Routes>
        <Route path="/auctions/:id" element={<AuctionDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('auction page (UC-09)', () => {
  beforeEach(() => {
    auctions.getAuction.mockReset();
    auctions.placeBid.mockReset();
  });

  it('shows the minimum bid from the server and subscribes to live updates', async () => {
    auctions.getAuction.mockResolvedValue(auction());
    renderPage();
    expect(await screen.findByText('Enter ₹1,100 to ₹11,000.')).toBeInTheDocument();
    expect(auctions.subscribe).toHaveBeenCalledWith('9', expect.any(Function));
  });

  it('places a bid and shows the updated highest bid', async () => {
    const user = userEvent.setup();
    auctions.getAuction.mockResolvedValue(auction());
    auctions.placeBid.mockResolvedValue(auction({ currentBid: 1100, minimumBid: 1200, iAmHighest: true, bidCount: 2 }));
    renderPage();
    await user.type(await screen.findByLabelText('Your bid (₹)'), '1100');
    await user.click(screen.getByRole('button', { name: /place bid/i }));
    expect(await screen.findByText('Your bid of ₹1,100 is the highest bid.')).toBeInTheDocument();
    expect(auctions.placeBid).toHaveBeenCalledWith(student, 9, '1100');
  });

  it("shows the server's reason when a bid is rejected and reloads the latest state", async () => {
    const user = userEvent.setup();
    auctions.getAuction.mockResolvedValue(auction());
    auctions.placeBid.mockRejectedValue(
      new ApiError(409, 'Your bid must be at least ₹1,200.', [{ field: 'amount', message: 'Your bid must be at least ₹1,200.' }]),
    );
    renderPage();
    await user.type(await screen.findByLabelText('Your bid (₹)'), '1100');
    await user.click(screen.getByRole('button', { name: /place bid/i }));
    expect(await screen.findByText('Your bid must be at least ₹1,200.')).toBeInTheDocument();
    expect(auctions.getAuction).toHaveBeenCalledTimes(2);
  });

  it('asks for confirmation before a bid of 3 times the minimum or more, and sends nothing on Cancel', async () => {
    const user = userEvent.setup();
    auctions.getAuction.mockResolvedValue(auction());
    renderPage();
    await user.type(await screen.findByLabelText('Your bid (₹)'), '5500');
    await user.click(screen.getByRole('button', { name: /place bid/i }));

    const dialog = screen.getByRole('dialog', { name: 'Confirm your bid' });
    expect(dialog).toHaveTextContent("You're bidding ₹5,500, which is 5 times the minimum bid of ₹1,100. Bids are binding. Continue?");
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(auctions.placeBid).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Your bid (₹)')).toHaveValue(5500);
  });

  it('places a big bid once it is confirmed', async () => {
    const user = userEvent.setup();
    auctions.getAuction.mockResolvedValue(auction());
    auctions.placeBid.mockResolvedValue(auction({ currentBid: 3300, minimumBid: 3400, maximumBid: 34000, iAmHighest: true }));
    renderPage();
    await user.type(await screen.findByLabelText('Your bid (₹)'), '3300');
    await user.click(screen.getByRole('button', { name: /place bid/i }));
    await user.click(screen.getByRole('button', { name: 'Yes, place bid' }));
    expect(await screen.findByText('Your bid of ₹3,300 is the highest bid.')).toBeInTheDocument();
    expect(auctions.placeBid).toHaveBeenCalledWith(student, 9, '3300');
  });

  it("does not confirm a bid over the maximum; the server's reason is shown instead", async () => {
    const user = userEvent.setup();
    auctions.getAuction.mockResolvedValue(auction());
    const text = 'Your bid can be at most ₹11,000 (10 times the minimum bid).';
    auctions.placeBid.mockRejectedValue(new ApiError(409, text, [{ field: 'amount', message: text }]));
    renderPage();
    await user.type(await screen.findByLabelText('Your bid (₹)'), '50000');
    await user.click(screen.getByRole('button', { name: /place bid/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await screen.findByText(text)).toBeInTheDocument();
  });

  it('does not offer bidding to the seller', async () => {
    auctions.getAuction.mockResolvedValue(auction({ isSeller: true }));
    renderPage();
    expect(await screen.findByText(/This is your auction/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Your bid (₹)')).not.toBeInTheDocument();
  });

  it('shows the winner when the auction has ended', async () => {
    auctions.getAuction.mockResolvedValue(
      auction({ status: 'ended', isWinner: true, winnerId: 2, winnerName: 'Priya Sharma', currentBid: 1500, endTime: new Date(Date.now() - 1000).toISOString() }),
    );
    renderPage();
    expect(await screen.findByText('You won this auction with ₹1,500!')).toBeInTheDocument();
    expect(screen.queryByLabelText('Your bid (₹)')).not.toBeInTheDocument();
  });
});

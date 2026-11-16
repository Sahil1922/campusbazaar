import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const student = { id: 2, name: 'Priya Sharma', roles: ['buyer', 'seller'] };

vi.mock('../auth.jsx', () => ({ useAuth: () => ({ user: student }) }));
vi.mock('../services/listings.js', () => ({
  listCategories: vi.fn(async () => [
    { id: 1, name: 'Books' },
    { id: 3, name: 'Furniture' },
  ]),
  searchListings: vi.fn(),
}));

const listings = await import('../services/listings.js');
const { default: Listings } = await import('../pages/Listings.jsx');

const card = (id, title, price, extra = {}) => ({
  id,
  title,
  price,
  priceNegotiable: false,
  condition: 'good',
  status: 'active',
  category: { id: 1, name: 'Books' },
  images: [],
  auction: null,
  ...extra,
});

function renderPage(url = '/listings') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/listings" element={<Listings />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('browse, search and filter (UC-03, UC-04)', () => {
  beforeEach(() => {
    listings.searchListings.mockReset();
    listings.searchListings.mockResolvedValue({ listings: [card(1, 'Grewal maths book', 450, { priceNegotiable: true })], total: 1, page: 1, pageSize: 24 });
  });

  it('shows the results with the Negotiable tag and the item count', async () => {
    renderPage('/listings?q=maths');
    expect(await screen.findByText('Grewal maths book')).toBeInTheDocument();
    expect(screen.getByText('Negotiable')).toBeInTheDocument();
    expect(screen.getByText('1 item')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Results for “maths”' })).toBeInTheDocument();
    expect(listings.searchListings).toHaveBeenCalledWith(student, expect.objectContaining({ q: 'maths', page: 1 }));
  });

  it('searches again when a category, condition or sort is chosen', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('radio', { name: 'Furniture' }));
    await waitFor(() => expect(listings.searchListings).toHaveBeenLastCalledWith(student, expect.objectContaining({ category: '3' })));
    await user.click(screen.getByRole('checkbox', { name: 'Like new' }));
    await waitFor(() =>
      expect(listings.searchListings).toHaveBeenLastCalledWith(student, expect.objectContaining({ category: '3', conditions: ['like_new'] })),
    );
    await user.click(screen.getByRole('button', { name: 'Price — low to high' }));
    await waitFor(() => expect(listings.searchListings).toHaveBeenLastCalledWith(student, expect.objectContaining({ sort: 'price_asc' })));
  });

  it('shows a helpful message when nothing matches', async () => {
    listings.searchListings.mockResolvedValue({ listings: [], total: 0, page: 1, pageSize: 24 });
    renderPage('/listings?q=bicycle');
    expect(await screen.findByText('No items match your search')).toBeInTheDocument();
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const student = { id: 2, name: 'Priya Sharma', roles: ['buyer', 'seller'] };

vi.mock('../auth.jsx', () => ({ useAuth: () => ({ user: student }) }));
vi.mock('../services/listings.js', () => ({
  listCategories: vi.fn(async () => [
    { id: 1, name: 'Books' },
    { id: 2, name: 'Electronics' },
  ]),
  createListing: vi.fn(),
  getListing: vi.fn(),
  updateListing: vi.fn(),
}));

const { ApiError } = await import('../api.js');
const listings = await import('../services/listings.js');
const { default: ListingForm } = await import('../pages/ListingForm.jsx');

function renderForm() {
  return render(
    <MemoryRouter initialEntries={['/sell']}>
      <Routes>
        <Route path="/sell" element={<ListingForm />} />
        <Route path="/listings/:id" element={<p>Listing page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function fillForm(user) {
  await user.type(screen.getByLabelText('Item name'), 'BESTOR Glide 7 Wireless Mouse');
  await user.type(screen.getByLabelText('Description'), 'Brand new with original packaging.');
  await user.selectOptions(await screen.findByLabelText('Category'), 'Electronics');
  await user.selectOptions(screen.getByLabelText('Condition'), 'new');
  await user.type(screen.getByLabelText('Price (₹)'), '120');
}

describe('Sell an item form (UC-02)', () => {
  beforeEach(() => {
    listings.createListing.mockReset();
  });

  it('sends the details, including "Price is negotiable", and opens the new listing', async () => {
    const user = userEvent.setup();
    listings.createListing.mockResolvedValue({ id: 41 });
    renderForm();
    await screen.findByRole('option', { name: 'Electronics' });
    await fillForm(user);
    await user.click(screen.getByRole('checkbox', { name: /price is negotiable/i }));
    await user.click(screen.getByRole('button', { name: 'Publish listing' }));

    expect(await screen.findByText('Listing page')).toBeInTheDocument();
    expect(listings.createListing).toHaveBeenCalledWith(
      student,
      expect.objectContaining({
        title: 'BESTOR Glide 7 Wireless Mouse',
        categoryId: '2',
        condition: 'new',
        price: '120',
        priceNegotiable: true,
        images: [],
      }),
    );
  });

  it("shows the server's field errors next to the fields and keeps what was typed", async () => {
    const user = userEvent.setup();
    listings.createListing.mockRejectedValue(
      new ApiError(400, 'Some of the information entered is invalid.', [
        { field: 'price', message: 'Enter a price between ₹1 and ₹10,00,000 (up to 2 decimals).' },
      ]),
    );
    renderForm();
    await screen.findByRole('option', { name: 'Electronics' });
    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Publish listing' }));

    expect(await screen.findByText('Please correct the highlighted fields.')).toBeInTheDocument();
    expect(screen.getByText(/Enter a price between/)).toBeInTheDocument();
    expect(screen.getByLabelText('Price (₹)')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Item name')).toHaveValue('BESTOR Glide 7 Wireless Mouse');
  });

  it('refuses files that are not JPG, PNG or WebP before uploading', async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderForm();
    const input = document.querySelector('input[type="file"]');
    await user.upload(input, new File(['x'], 'notes.pdf', { type: 'application/pdf' }));
    expect(screen.getByText('notes.pdf: use JPG, PNG or WebP.')).toBeInTheDocument();
  });
});

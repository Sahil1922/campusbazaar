import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
// Real shrinking needs a browser canvas (tested in photos.test.js); here photos pass through unchanged.
vi.mock('../lib/photos.js', () => ({ shrinkPhoto: vi.fn(async (file) => file) }));

const { ApiError } = await import('../api.js');
const listings = await import('../services/listings.js');
const photos = await import('../lib/photos.js');
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

describe('adding photos to a listing', () => {
  const originalMatchMedia = window.matchMedia;
  const photoOf = (bytes, name = 'IMG_1.jpg') => new File([new Uint8Array(bytes)], name, { type: 'image/jpeg' });

  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:preview');
    URL.revokeObjectURL = vi.fn();
    photos.shrinkPhoto.mockImplementation(async (file) => file);
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    delete navigator.mediaDevices;
    vi.restoreAllMocks();
  });

  it('accepts a phone photo over 5 MB once it has been made smaller', async () => {
    const user = userEvent.setup();
    photos.shrinkPhoto.mockResolvedValue(photoOf(200_000));
    renderForm();
    await user.upload(document.querySelector('input[type="file"]'), photoOf(7 * 1024 * 1024));
    expect(await screen.findByAltText('Photo 1')).toBeInTheDocument();
    expect(screen.queryByText(/must be 5 MB or smaller/)).not.toBeInTheDocument();
  });

  it('still refuses a photo that is over 5 MB after shrinking', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.upload(document.querySelector('input[type="file"]'), photoOf(6 * 1024 * 1024, 'huge.jpg'));
    expect(await screen.findByText('huge.jpg: must be 5 MB or smaller.')).toBeInTheDocument();
    expect(screen.queryByAltText('Photo 1')).not.toBeInTheDocument();
  });

  it('opens the phone camera app on touch devices', async () => {
    const user = userEvent.setup();
    window.matchMedia = (query) => ({ matches: query === '(pointer: coarse)', media: query, addEventListener() {}, removeEventListener() {} });
    renderForm();
    const cameraInput = screen.getByLabelText('Take photo with camera');
    expect(cameraInput).toHaveAttribute('capture', 'environment');
    const click = vi.spyOn(cameraInput, 'click');
    await user.click(screen.getByRole('button', { name: 'Take photo' }));
    expect(click).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('takes a photo with a laptop webcam and switches the camera off afterwards', async () => {
    const user = userEvent.setup();
    const track = { stop: vi.fn() };
    navigator.mediaDevices = { getUserMedia: vi.fn(async () => ({ getTracks: () => [track] })) };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() });
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((done, type) => done(new Blob(['jpeg'], { type })));
    renderForm();

    await user.click(screen.getByRole('button', { name: 'Take photo' }));
    const dialog = screen.getByRole('dialog', { name: 'Take a photo' });
    expect(within(dialog).getByRole('button', { name: 'Capture' })).toBeDisabled();
    const video = within(dialog).getByLabelText('Camera preview');
    Object.defineProperty(video, 'videoWidth', { value: 1280 });
    Object.defineProperty(video, 'videoHeight', { value: 720 });
    fireEvent.loadedMetadata(video);
    await user.click(within(dialog).getByRole('button', { name: 'Capture' }));

    expect(await screen.findByAltText('Photo 1')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(track.stop).toHaveBeenCalled();
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(expect.objectContaining({ audio: false }));
  });

  it('explains when camera access is blocked', async () => {
    const user = userEvent.setup();
    const denied = Object.assign(new Error('denied'), { name: 'NotAllowedError' });
    navigator.mediaDevices = { getUserMedia: vi.fn(() => Promise.reject(denied)) };
    renderForm();
    await user.click(screen.getByRole('button', { name: 'Take photo' }));
    expect(await screen.findByText(/Camera access is blocked/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

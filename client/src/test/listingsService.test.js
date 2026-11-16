import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api.js', () => ({ api: vi.fn() }));

const { api } = await import('../api.js');
const { createListing, searchListings, updateListing } = await import('../services/listings.js');

describe('listings service', () => {
  beforeEach(() => {
    api.mockReset();
  });

  it('sends a new listing as multipart form data with the negotiable flag and new photos', async () => {
    api.mockResolvedValue({ listing: { id: 7 } });
    const photo = new File(['x'], 'mouse.png', { type: 'image/png' });
    await createListing(null, {
      title: 'Wireless mouse',
      description: 'Brand new in box.',
      categoryId: '2',
      condition: 'new',
      price: '120',
      priceNegotiable: true,
      images: [{ key: 'new-1', file: photo, url: 'blob:1' }],
    });
    const [path, options] = api.mock.calls[0];
    expect(path).toBe('/listings');
    expect(options.method).toBe('POST');
    const form = options.body;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get('priceNegotiable')).toBe('true');
    expect(form.get('price')).toBe('120');
    expect(form.get('keepImageIds')).toBe('');
    expect(form.getAll('images')).toHaveLength(1);
  });

  it('keeps chosen saved photos when editing', async () => {
    api.mockResolvedValue({ listing: { id: 7 } });
    await updateListing(null, 7, {
      title: 'Wireless mouse',
      description: 'Brand new in box.',
      categoryId: '2',
      condition: 'new',
      price: '120',
      priceNegotiable: false,
      images: [{ key: 'saved-3', id: 3, url: '/uploads/a.png' }, { key: 'saved-9', id: 9, url: '/uploads/b.png' }],
    });
    const [path, options] = api.mock.calls[0];
    expect(path).toBe('/listings/7');
    expect(options.method).toBe('PUT');
    expect(options.body.get('keepImageIds')).toBe('3,9');
    expect(options.body.get('priceNegotiable')).toBe('false');
  });

  it('builds the search query and leaves out empty filters and defaults', async () => {
    api.mockResolvedValue({ listings: [], total: 0 });
    await searchListings(null, { q: ' maths book ', category: '1', conditions: ['good', 'new'], minPrice: '', maxPrice: '500', sort: 'newest', page: 1 });
    expect(api).toHaveBeenCalledWith('/listings?q=maths+book&category=1&condition=good%2Cnew&max=500');
  });
});

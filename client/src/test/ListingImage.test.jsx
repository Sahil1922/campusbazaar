import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ListingImage } from '../components/ui.jsx';

const listing = { title: 'Mac M4', category: { name: 'Electronics' }, images: [{ id: 1, url: '/uploads/listings/gone.jpg' }] };

describe('listing photo', () => {
  it('shows the photo when it loads', () => {
    render(<ListingImage listing={listing} />);
    expect(screen.getByRole('img', { name: 'Mac M4' })).toHaveAttribute('src', '/uploads/listings/gone.jpg');
  });

  it('shows the category placeholder instead of a broken image when the photo file is missing', () => {
    render(<ListingImage listing={listing} />);
    fireEvent.error(screen.getByRole('img', { name: 'Mac M4' }));
    expect(screen.getByRole('img', { name: 'Electronics — no photo' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Mac M4' })).not.toBeInTheDocument();
  });
});

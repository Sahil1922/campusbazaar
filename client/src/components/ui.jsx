import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon.jsx';
import { categoryStyle } from '../lib/categories.js';
import { conditionLabel, formatPrice, remainingParts } from '../lib/format.js';

export function Loading({ label = 'Loading…' }) {
  return (
    <p className="muted" role="status">
      {label}
    </p>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="card">
      <p className="form-error" role="alert">
        {error?.message ?? 'Something went wrong.'}
      </p>
      {onRetry && (
        <button type="button" className="button" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ icon = 'search', title, children }) {
  return (
    <div className="empty">
      <div className="category-icon">
        <Icon name={icon} size={28} />
      </div>
      <h2>{title}</h2>
      {children}
    </div>
  );
}

/**
 * First listing image, or a coloured placeholder with the category icon — also used when the
 * photo file cannot be loaded, so a missing file never shows as a broken image.
 */
export function ListingImage({ listing, index = 0 }) {
  const image = listing.images?.[index];
  const src = typeof image === 'string' ? image : image?.url;
  const [failedSrc, setFailedSrc] = useState(null);
  if (src && src !== failedSrc) {
    return <img className="photo" src={src} alt={listing.title} loading="lazy" onError={() => setFailedSrc(src)} />;
  }
  const name = listing.category?.name;
  const style = categoryStyle(name);
  return (
    <div className="placeholder-image" style={{ background: style.color }} role="img" aria-label={`${name ?? 'Item'} — no photo`}>
      <Icon name={style.icon} size={56} />
    </div>
  );
}

export function RatingPill({ value }) {
  if (value === null || value === undefined) return null;
  return (
    <span className="rating-pill" aria-label={`Rated ${value} out of 5`}>
      {value} <Icon name="star" size={12} />
    </span>
  );
}

export function Stars({ value, size = 16 }) {
  return (
    <span className="stars" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Icon key={n} name="star" size={size} style={{ opacity: n <= Math.round(value) ? 1 : 0.25 }} />
      ))}
    </span>
  );
}

/** Live countdown for display only — the server decides when an auction actually ends. */
export function Countdown({ endTime, onEnd, compact = false }) {
  const [now, setNow] = useState(Date.now());
  const ended = useRef(false);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const t = remainingParts(endTime, now);
  useEffect(() => {
    if (t.ended && !ended.current) {
      ended.current = true;
      onEnd?.();
    }
  }, [t.ended, onEnd]);

  if (t.ended) return <span className="countdown countdown-ended">Auction ended</span>;
  const pad = (n) => String(n).padStart(2, '0');
  const text = t.days > 0 ? `${t.days}d ${t.hours}h ${pad(t.minutes)}m` : `${pad(t.hours)}:${pad(t.minutes)}:${pad(t.seconds)}`;
  return (
    <span className="countdown" aria-label={`Time left: ${text}`}>
      <Icon name="clock" size={compact ? 14 : 18} />
      {compact ? text : `${text} left`}
    </span>
  );
}

/** `onOpen(path)` replaces normal navigation, e.g. to ask signed-out visitors to log in first. */
export function ListingCard({ listing, onOpen }) {
  const inAuction = listing.status === 'in_auction' && listing.auction?.status === 'active';
  const path = inAuction ? `/auctions/${listing.auction.id}` : `/listings/${listing.id}`;
  const handleClick = onOpen
    ? (event) => {
        event.preventDefault();
        onOpen(path);
      }
    : undefined;
  return (
    <Link to={path} className="listing-card" onClick={handleClick}>
      {inAuction && <span className="live-badge card-badge">LIVE AUCTION</span>}
      <ListingImage listing={listing} />
      <div className="listing-card-body">
        <span className="listing-title">{listing.title}</span>
        {inAuction ? (
          <>
            <span className="bid-label">{listing.auction.currentBid === null ? 'Starting bid' : 'Current bid'}</span>
            <span className="price current-bid">{formatPrice(listing.auction.currentBid ?? listing.auction.startingPrice)}</span>
            <Countdown endTime={listing.auction.endTime} compact />
          </>
        ) : (
          <span className="price">
            {formatPrice(listing.price)}
            {listing.priceNegotiable && (
              <span className="tag tag-green" style={{ marginLeft: '0.4rem', verticalAlign: '0.15rem' }}>
                Negotiable
              </span>
            )}
          </span>
        )}
        <span className="meta">
          <span className="tag">{conditionLabel(listing.condition)}</span>
          <span>{listing.category?.name}</span>
        </span>
      </div>
    </Link>
  );
}

export function AuctionCard({ auction }) {
  const live = auction.status === 'active';
  return (
    <Link to={`/auctions/${auction.id}`} className="listing-card">
      <span className={`${live ? 'live-badge' : 'ended-badge'} card-badge`}>{live ? 'LIVE' : 'ENDED'}</span>
      <ListingImage listing={auction.listing} />
      <div className="listing-card-body">
        <span className="listing-title">{auction.listing.title}</span>
        <span className="bid-label">{auction.currentBid === null ? 'Starting bid' : live ? 'Current bid' : 'Winning bid'}</span>
        <span className="price current-bid">{formatPrice(auction.currentBid ?? auction.startingPrice)}</span>
        <span className="meta">
          <span>
            {auction.bidCount} {auction.bidCount === 1 ? 'bid' : 'bids'}
          </span>
          {live ? <Countdown endTime={auction.endTime} compact /> : <span>Ended</span>}
        </span>
      </div>
    </Link>
  );
}

export function Dialog({ title, onClose, children }) {
  const titleId = useId();
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.querySelector('input, select, textarea, button')?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref}>
        <h2 id={titleId}>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function SelectField({ label, error, hint, children, ...props }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-e` : hint ? `${id}-h` : undefined} {...props}>
        {children}
      </select>
      {hint && !error && (
        <p className="hint" id={`${id}-h`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field-error" id={`${id}-e`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function TextAreaField({ label, error, hint, ...props }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <textarea id={id} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-e` : hint ? `${id}-h` : undefined} {...props} />
      {hint && !error && (
        <p className="hint" id={`${id}-h`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field-error" id={`${id}-e`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import Icon from '../components/Icon.jsx';
import ReportDialog from '../components/ReportDialog.jsx';
import Reviews from '../components/Reviews.jsx';
import { Countdown, ErrorState, ListingImage, Loading, RatingPill } from '../components/ui.jsx';
import { features } from '../lib/features.js';
import { useAsync } from '../lib/useAsync.js';
import { conditionLabel, formatDate, formatPrice, initials } from '../lib/format.js';
import { deleteListing, getListing } from '../services/listings.js';

/** UC-03 listing details, with Contact Seller (UC-05) and owner actions. */
export default function ListingDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const listing = useAsync(() => getListing(user, id), [user, id]);
  const [imageIndex, setImageIndex] = useState(0);
  const [reporting, setReporting] = useState(false);
  const [actionError, setActionError] = useState(null);

  if (listing.loading) return <Loading label="Loading item…" />;
  if (listing.error) {
    return (
      <div className="medium">
        <ErrorState error={listing.error} onRetry={listing.error.status === 404 ? undefined : listing.reload} />
        <p>
          <Link to="/listings">← Back to all items</Link>
        </p>
      </div>
    );
  }

  const l = listing.data;
  const isOwner = l.sellerId === user.id;
  const liveAuction = l.auction?.status === 'active' ? l.auction : null;

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${l.title}"? This cannot be undone.`)) return;
    try {
      await deleteListing(user, l.id);
      navigate('/my/listings', { replace: true, state: { message: 'Listing deleted.' } });
    } catch (err) {
      setActionError(err.message);
    }
  };

  return (
    <>
      <div className="detail">
        <div className="card gallery">
          <div className="gallery-main">
            <ListingImage listing={l} index={imageIndex} />
          </div>
          {l.images.length > 1 && (
            <div className="gallery-thumbs">
              {l.images.map((img, i) => (
                <button key={img.id ?? i} type="button" aria-pressed={i === imageIndex} aria-label={`Photo ${i + 1}`} onClick={() => setImageIndex(i)}>
                  <img className="photo" src={img.url} alt="" />
                </button>
              ))}
            </div>
          )}
          <div className="gallery-actions">
            {isOwner ? (
              l.status === 'active' ? (
                <>
                  <Link to={`/listings/${l.id}/edit`} className="button button-amber button-large">
                    Edit listing
                  </Link>
                  {features.auctions ? (
                    <Link to={`/listings/${l.id}/auction`} className="button button-red button-large">
                      <Icon name="gavel" size={18} /> Start auction
                    </Link>
                  ) : (
                    <button type="button" className="button button-red button-large" disabled title="Auctions are switched on in Sprint 4">
                      <Icon name="gavel" size={18} /> Start auction
                    </button>
                  )}
                </>
              ) : liveAuction ? (
                <Link to={`/auctions/${liveAuction.id}`} className="button button-red button-large" style={{ gridColumn: '1 / -1' }}>
                  View your live auction
                </Link>
              ) : null
            ) : liveAuction ? (
              <Link to={`/auctions/${liveAuction.id}`} className="button button-red button-large" style={{ gridColumn: '1 / -1' }}>
                <Icon name="gavel" size={18} /> Bid in live auction
              </Link>
            ) : (
              <>
                {features.messaging ? (
                  <Link to={`/messages/${l.id}/${user.id}`} className="button button-orange button-large">
                    <Icon name="chat" size={18} /> Contact seller
                  </Link>
                ) : (
                  <button type="button" className="button button-orange button-large" disabled title="Messaging is switched on in Sprint 3">
                    <Icon name="chat" size={18} /> Contact seller
                  </button>
                )}
                <button type="button" className="button button-secondary button-large" disabled={!features.moderation} title={features.moderation ? undefined : 'Reporting is switched on in Sprint 3'} onClick={() => setReporting(true)}>
                  <Icon name="flag" size={18} /> Report
                </button>
              </>
            )}
          </div>
          {isOwner && l.status === 'active' && (
            <button type="button" className="button button-outline-danger full" style={{ marginTop: '0.6rem' }} onClick={handleDelete}>
              Delete listing
            </button>
          )}
          {!features.messaging && !isOwner && !liveAuction && (
            <p className="muted small" style={{ margin: '0.6rem 0 0' }}>Contact seller and Report are switched on in Sprint 3.</p>
          )}
          {!features.auctions && isOwner && l.status === 'active' && (
            <p className="muted small" style={{ margin: '0.6rem 0 0' }}>Starting auctions is switched on in Sprint 4.</p>
          )}
          {actionError && (
            <p className="form-error" role="alert" style={{ marginTop: '0.6rem' }}>
              {actionError}
            </p>
          )}
        </div>

        <div className="stack">
          <section className="card">
            <p className="muted small" style={{ margin: '0 0 0.4rem' }}>
              <Link to={`/listings?category=${l.categoryId}`}>{l.category?.name}</Link>
            </p>
            <h1>{l.title}</h1>
            {liveAuction ? (
              <div style={{ margin: '0.5rem 0 1rem' }}>
                <span className="live-badge">LIVE AUCTION</span>
                <div className="bid-label" style={{ marginTop: '0.6rem' }}>
                  {liveAuction.currentBid === null ? 'Starting bid' : 'Current bid'}
                </div>
                <div className="price-large current-bid">{formatPrice(liveAuction.currentBid ?? liveAuction.startingPrice)}</div>
                <Countdown endTime={liveAuction.endTime} />
              </div>
            ) : (
              <div style={{ margin: '0.5rem 0 1rem' }}>
                <span className="price-large">{formatPrice(l.price)}</span>
                {l.priceNegotiable && (
                  <span className="tag tag-green" style={{ marginLeft: '0.75rem', verticalAlign: '0.4rem' }}>
                    Negotiable
                  </span>
                )}
                {l.status !== 'active' && (
                  <span className={`status status-${l.status}`} style={{ marginLeft: '0.75rem' }}>
                    {l.status.replace('_', ' ')}
                  </span>
                )}
                {l.priceNegotiable && !isOwner && l.status === 'active' && (
                  <p className="muted small" style={{ margin: '0.35rem 0 0' }}>
                    The seller is open to offers — use Contact seller to agree a price.
                  </p>
                )}
              </div>
            )}
            <table className="spec-table">
              <tbody>
                <tr>
                  <th scope="row">Condition</th>
                  <td>
                    <span className="tag tag-blue">{conditionLabel(l.condition)}</span>
                  </td>
                </tr>
                <tr>
                  <th scope="row">Category</th>
                  <td>{l.category?.name}</td>
                </tr>
                <tr>
                  <th scope="row">Listed on</th>
                  <td>{formatDate(l.createdAt)}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className="card">
            <h2>Description</h2>
            <p className="description">{l.description}</p>
          </section>

          <section className="card">
            <h2>Seller</h2>
            <div className="seller-box">
              <span className="avatar">{initials(l.seller.name)}</span>
              <div>
                <strong>{isOwner ? `${l.seller.name} (you)` : l.seller.name}</strong>
                <div className="meta">
                  <RatingPill value={l.seller.averageRating} />
                  <span>
                    {l.seller.reviewsCount} {l.seller.reviewsCount === 1 ? 'review' : 'reviews'}
                  </span>
                </div>
              </div>
            </div>
          </section>

          <Reviews userId={l.seller.id} userName={isOwner ? 'you' : l.seller.name} listingId={l.id} />
        </div>
      </div>
      {reporting && <ReportDialog listing={l} onClose={() => setReporting(false)} />}
    </>
  );
}

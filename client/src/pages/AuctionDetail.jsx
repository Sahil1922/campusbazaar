import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { ApiError } from '../api.js';
import Field from '../components/Field.jsx';
import Icon from '../components/Icon.jsx';
import { Countdown, ErrorState, ListingImage, Loading } from '../components/ui.jsx';
import { useAsync } from '../lib/useAsync.js';
import { conditionLabel, formatDateTime, formatPrice, timeAgo } from '../lib/format.js';
import { getAuction, placeBid, subscribe } from '../services/auctions.js';

/**
 * UC-09 Place Bid / Participate in Auction, View Bids (seller) and the winner result.
 * Everything shown comes from the server's state; the countdown is display only.
 */
export default function AuctionDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const auction = useAsync(() => getAuction(user, id), [user, id]);
  const [amount, setAmount] = useState('');
  const [bidError, setBidError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [bidding, setBidding] = useState(false);
  const { reload } = auction;

  // Live updates: refetch whenever a new bid is stored (Socket.IO in Sprint 4).
  useEffect(() => subscribe(id, reload), [id, reload]);
  const handleEnd = useCallback(() => setTimeout(reload, 500), [reload]);

  if (auction.loading && !auction.data) return <Loading label="Loading auction…" />;
  if (auction.error && !auction.data) return <ErrorState error={auction.error} onRetry={auction.reload} />;

  const a = auction.data;
  const live = a.status === 'active';
  const l = a.listing;

  const submitBid = async (event) => {
    event.preventDefault();
    setBidError(null);
    setNotice(null);
    setBidding(true);
    try {
      const updated = await placeBid(user, a.id, amount);
      auction.setData(updated);
      setAmount('');
      setNotice(`Your bid of ${formatPrice(updated.currentBid)} is the highest bid.`);
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'Your bid could not be placed. Please try again.');
      setBidError(e.fieldErrors.amount ?? e.message);
      auction.reload(); // Show the latest state the server rejected the bid against.
    } finally {
      setBidding(false);
    }
  };

  return (
    <>
      <div className="detail">
        <div className="card gallery">
          <div className="gallery-main">
            <ListingImage listing={l} />
          </div>
          <p className="muted small" style={{ marginBottom: 0 }}>
            {conditionLabel(l.condition)} · {l.category?.name} · Seller: {a.isSeller ? 'you' : l.seller.name}
          </p>
          <p className="description" style={{ marginBottom: 0 }}>
            {l.description}
          </p>
          {/* Sold or unavailable listings can only be opened by their seller. */}
          {(a.isSeller || ['active', 'in_auction'].includes(l.status)) && (
            <p style={{ marginBottom: 0 }}>
              <Link to={`/listings/${l.id}`}>View item details</Link>
            </p>
          )}
          {l.status === 'sold' && (
            <p style={{ marginBottom: 0 }}>
              <span className="status status-sold">Sold</span>
            </p>
          )}
        </div>

        <div className="stack">
          <section className="card auction-panel" aria-labelledby="auction-title">
            {live ? <span className="live-badge">LIVE AUCTION</span> : <span className="ended-badge">AUCTION ENDED</span>}
            <h1 id="auction-title" style={{ marginTop: '0.6rem' }}>
              {l.title}
            </h1>

            {!live && (
              <div className="winner-box" role="status">
                <Icon name="trophy" style={{ color: 'var(--amber)', verticalAlign: '-4px' }} />{' '}
                {a.winnerId ? (
                  a.isWinner ? (
                    <strong>You won this auction with {formatPrice(a.currentBid)}!</strong>
                  ) : (
                    <>
                      Won by <strong>{a.winnerName}</strong> with {formatPrice(a.currentBid)}.
                    </>
                  )
                ) : (
                  'This auction ended with no bids.'
                )}
              </div>
            )}

            <div className="auction-stats">
              <div>
                <div className="bid-label">{a.currentBid === null ? 'Starting bid' : live ? 'Current bid' : 'Winning bid'}</div>
                <div className="value current-bid">{formatPrice(a.currentBid ?? a.startingPrice)}</div>
              </div>
              <div>
                <div className="bid-label">Time left</div>
                <div className="value">{live ? <Countdown endTime={a.endTime} onEnd={handleEnd} compact /> : '—'}</div>
              </div>
              <div>
                <div className="bid-label">Bids</div>
                <div className="value">{a.bidCount}</div>
              </div>
              <div>
                <div className="bid-label">Bid increment</div>
                <div className="value">{formatPrice(a.bidIncrement)}</div>
              </div>
            </div>
            <p className="muted small">
              {live ? 'Ends' : 'Ended'} {formatDateTime(a.endTime)} · Started at {formatPrice(a.startingPrice)}
            </p>

            {live && a.isSeller && <p className="form-info">This is your auction. You can follow the bids below but cannot bid.</p>}

            {live && !a.isSeller && (
              <>
                {a.iAmHighest && !notice && <p className="form-success">You have the highest bid.</p>}
                {notice && (
                  <p className="form-success" role="status">
                    {notice}
                  </p>
                )}
                <form className="bid-form" onSubmit={submitBid} noValidate>
                  <Field
                    label="Your bid (₹)"
                    type="number"
                    inputMode="decimal"
                    min={a.minimumBid}
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder={String(a.minimumBid)}
                    hint={`Enter ${formatPrice(a.minimumBid)} or more.`}
                    error={bidError}
                  />
                  <button type="submit" className="button button-red button-large" style={{ marginTop: '1.55rem' }} disabled={bidding}>
                    <Icon name="gavel" size={18} /> {bidding ? 'Placing…' : 'Place bid'}
                  </button>
                </form>
              </>
            )}
          </section>

          <section className="card" aria-labelledby="bids-heading">
            <h2 id="bids-heading">Bid history</h2>
            {a.bids.length === 0 ? (
              <p className="muted">No bids yet. {live && !a.isSeller && 'Be the first!'}</p>
            ) : (
              <ol className="bid-history">
                {a.bids.map((b) => (
                  <li key={b.id}>
                    <span>
                      <strong>{b.isMine ? 'You' : b.bidderName}</strong>
                      <br />
                      <span className="muted small">{timeAgo(b.placedAt)}</span>
                    </span>
                    <span className="bid-amount">{formatPrice(b.amount)}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

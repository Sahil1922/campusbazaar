import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import Icon from '../components/Icon.jsx';
import { EmptyState, ErrorState, ListingImage, Loading } from '../components/ui.jsx';
import { features } from '../lib/features.js';
import { useAsync } from '../lib/useAsync.js';
import { formatDate, formatPrice } from '../lib/format.js';
import { deleteListing, myListings } from '../services/listings.js';

const STATUS_LABELS = { active: 'Active', in_auction: 'In auction', sold: 'Sold', removed: 'Removed by admin' };

/** Seller's own listings with Edit / Delete / Start Auction. */
export default function MyListings() {
  const { user } = useAuth();
  const location = useLocation();
  const listings = useAsync(() => myListings(user), [user]);
  const [message, setMessage] = useState(location.state?.message ? { type: 'success', text: location.state.message } : null);

  const remove = async (l) => {
    if (!window.confirm(`Delete "${l.title}"? This cannot be undone.`)) return;
    try {
      await deleteListing(user, l.id);
      listings.setData((list) => list.filter((x) => x.id !== l.id));
      setMessage({ type: 'success', text: 'Listing deleted.' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  return (
    <>
      <section className="card">
        <div className="section-head">
          <h1>My listings</h1>
          <Link to="/sell" className="button button-orange">
            <Icon name="plus" size={18} /> Sell an item
          </Link>
        </div>
        {message && (
          <p className={message.type === 'error' ? 'form-error' : 'form-success'} role="status">
            {message.text}
          </p>
        )}
        {listings.loading ? (
          <Loading />
        ) : listings.error ? (
          <ErrorState error={listings.error} onRetry={listings.reload} />
        ) : listings.data.length === 0 ? (
          <EmptyState icon="tag" title="You haven't listed anything yet">
            <Link to="/sell" className="button button-orange">
              Sell your first item
            </Link>
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col">Price</th>
                  <th scope="col">Status</th>
                  <th scope="col">Listed</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {listings.data.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', minWidth: 220 }}>
                        <div style={{ width: 64, flexShrink: 0 }}>
                          <ListingImage listing={l} />
                        </div>
                        <Link to={`/listings/${l.id}`}>{l.title}</Link>
                      </div>
                    </td>
                    <td>{formatPrice(l.price)}</td>
                    <td>
                      <span className={`status status-${l.status}`}>{STATUS_LABELS[l.status] ?? l.status}</span>
                    </td>
                    <td>{formatDate(l.createdAt)}</td>
                    <td>
                      <div className="button-row" style={{ flexWrap: 'nowrap' }}>
                        {l.status === 'active' ? (
                          <>
                            <Link to={`/listings/${l.id}/edit`} className="button button-secondary button-small">
                              Edit
                            </Link>
                            {features.auctions ? (
                              <Link to={`/listings/${l.id}/auction`} className="button button-red button-small">
                                Auction
                              </Link>
                            ) : (
                              <button type="button" className="button button-red button-small" disabled title="Auctions are switched on in Sprint 4">
                                Auction
                              </button>
                            )}
                            <button type="button" className="button button-outline-danger button-small" onClick={() => remove(l)}>
                              Delete
                            </button>
                          </>
                        ) : l.auction && features.auctions ? (
                          <Link to={`/auctions/${l.auction.id}`} className="button button-red button-small">
                            View bids
                          </Link>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

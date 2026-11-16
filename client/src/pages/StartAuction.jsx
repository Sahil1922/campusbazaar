import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { ApiError } from '../api.js';
import Field from '../components/Field.jsx';
import Icon from '../components/Icon.jsx';
import { ErrorState, ListingImage, Loading, SelectField } from '../components/ui.jsx';
import { useAsync } from '../lib/useAsync.js';
import { formatDateTime, formatPrice } from '../lib/format.js';
import { getListing } from '../services/listings.js';
import { DURATIONS, startAuction, suggestIncrement } from '../services/auctions.js';

/**
 * UC-07 Start Auction + UC-08 Set Auction Details.
 * The starting price is pre-filled with the listed price and may not be higher (the server checks
 * this too); the increment is suggested from the starting price until the seller edits it.
 */
export default function StartAuction() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const listing = useAsync(() => getListing(user, id), [user, id]);
  const [form, setForm] = useState({ startingPrice: '', bidIncrement: '', durationHours: '' });
  const incrementEdited = useRef(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  const listedPrice = listing.data?.price;
  useEffect(() => {
    if (listedPrice === undefined) return;
    setForm((f) => ({ ...f, startingPrice: String(listedPrice), bidIncrement: suggestIncrement(listedPrice) }));
  }, [listedPrice]);

  if (listing.loading) return <Loading />;
  if (listing.error) return <ErrorState error={listing.error} />;

  const l = listing.data;
  if (l.sellerId !== user.id || l.status !== 'active') {
    return (
      <div className="medium">
        <ErrorState error={{ message: 'Only your own active listings that are not already in an auction can be auctioned.' }} />
        <Link to="/my/listings">← Choose another listing</Link>
      </div>
    );
  }

  const updateStartingPrice = (event) => {
    const value = event.target.value;
    setForm((f) => ({ ...f, startingPrice: value, bidIncrement: incrementEdited.current ? f.bidIncrement : suggestIncrement(value) }));
  };
  const updateIncrement = (event) => {
    incrementEdited.current = true;
    setForm((f) => ({ ...f, bidIncrement: event.target.value }));
  };
  const updateDuration = (event) => setForm((f) => ({ ...f, durationHours: event.target.value }));
  const endsAt = form.durationHours ? new Date(Date.now() + Number(form.durationHours) * 3600 * 1000) : null;
  const tooHigh = form.startingPrice !== '' && Number(form.startingPrice) > l.price;
  const startingPriceError =
    errors.startingPrice ??
    (tooHigh ? `Starting price can't be more than your listed price (${formatPrice(l.price)}). Edit the listing price first if you want to start higher.` : undefined);

  const submit = async (event) => {
    event.preventDefault();
    setErrors({});
    setFormError(null);
    if (tooHigh) {
      setFormError('Please correct the highlighted fields.');
      return;
    }
    setSaving(true);
    try {
      const auction = await startAuction(user, l.id, form);
      navigate(`/auctions/${auction.id}`, { replace: true });
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'Something went wrong. Please try again.');
      setErrors(e.fieldErrors);
      setFormError(Object.keys(e.fieldErrors).length ? 'Please correct the highlighted fields.' : e.message);
      setSaving(false);
    }
  };

  return (
    <div className="medium">
      <section className="card auction-panel">
        <h1>
          <Icon name="gavel" style={{ color: 'var(--red)', verticalAlign: '-3px' }} /> Start an auction
        </h1>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', margin: '0.5rem 0 1.25rem' }}>
          <div style={{ width: 96, flexShrink: 0 }}>
            <ListingImage listing={l} />
          </div>
          <div>
            <strong>{l.title}</strong>
            <div className="muted small">Listed at {formatPrice(l.price)}</div>
          </div>
        </div>

        <div className="form-info small">
          <strong>How your listed price and the auction work together</strong>
          <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem' }}>
            <li>While the auction runs, buyers see bids instead of your {formatPrice(l.price)} price.</li>
            <li>The starting price can be your listed price or lower — starting lower usually attracts more bidders.</li>
            <li>If someone bids, the highest bid when time runs out wins and the item is marked sold.</li>
            <li>If nobody bids, the item goes back on sale at {formatPrice(l.price)}.</li>
          </ul>
        </div>

        <form onSubmit={submit} noValidate>
          <div className="field-row">
            <Field
              label="Starting price (₹)"
              type="number"
              inputMode="decimal"
              min="1"
              max={l.price}
              step="0.01"
              value={form.startingPrice}
              onChange={updateStartingPrice}
              required
              error={startingPriceError}
              hint={`The first bid must be at least this. At most ${formatPrice(l.price)}.`}
            />
            <Field
              label="Bid increment (₹)"
              type="number"
              inputMode="decimal"
              min="1"
              step="0.01"
              value={form.bidIncrement}
              onChange={updateIncrement}
              required
              error={errors.bidIncrement}
              hint="Each new bid must beat the current one by at least this. Suggested: about 5% of the starting price."
            />
          </div>
          <SelectField
            label="Auction duration"
            value={form.durationHours}
            onChange={updateDuration}
            required
            error={errors.durationHours}
            hint={endsAt ? `Ends around ${formatDateTime(endsAt)}. The server sets the exact end time.` : undefined}
          >
            <option value="">Choose how long bidding stays open</option>
            {DURATIONS.map((d) => (
              <option key={d.hours} value={d.hours}>
                {d.label}
              </option>
            ))}
          </SelectField>
          <p className="muted small">Once started, the listing can't be edited and bidding is open to all verified students except you.</p>
          {formError && (
            <p className="form-error" role="alert">
              {formError}
            </p>
          )}
          <div className="button-row">
            <button type="submit" className="button button-red button-large" disabled={saving}>
              {saving ? 'Starting…' : 'Start auction'}
            </button>
            <Link to={`/listings/${l.id}`} className="button button-secondary button-large">
              Cancel
            </Link>
          </div>
        </form>
      </section>
    </div>
  );
}

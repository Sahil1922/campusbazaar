import { useState } from 'react';
import { useAuth } from '../auth.jsx';
import { ApiError } from '../api.js';
import Icon from './Icon.jsx';
import { ErrorState, Loading, Stars, TextAreaField } from './ui.jsx';
import { useAsync } from '../lib/useAsync.js';
import { formatDate } from '../lib/format.js';
import { addReview, listReviews } from '../services/reviews.js';

function StarInput({ value, onChange, error }) {
  return (
    <fieldset className="field" style={{ border: 'none', padding: 0, margin: '0 0 1rem' }}>
      <legend>Your rating</legend>
      <div className="star-input">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" data-on={n <= value} aria-pressed={n === value} aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => onChange(n)}>
            <Icon name="star" size={30} />
          </button>
        ))}
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}

/** UC-06 Rate and Review: shows reviews a user received and lets others add one. */
export default function Reviews({ userId, userName, listingId }) {
  const { user } = useAuth();
  const reviews = useAsync(() => listReviews(user, userId), [user, userId]);
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setErrors({});
    setFormError(null);
    setSaving(true);
    try {
      const review = await addReview(user, { revieweeId: userId, listingId, rating, comment });
      reviews.setData((list) => [review, ...(list ?? [])]);
      setOpen(false);
      setRating(0);
      setComment('');
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'Something went wrong.');
      setErrors(e.fieldErrors);
      if (!Object.keys(e.fieldErrors).length) setFormError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const list = reviews.data ?? [];
  const average = list.length ? (list.reduce((s, r) => s + r.rating, 0) / list.length).toFixed(1) : null;
  // One review per seller per listing; the server enforces this too.
  const alreadyReviewed = list.some((r) => r.isMine && r.listingId === listingId);
  const canReview = user.id !== userId && !reviews.loading && !alreadyReviewed;

  return (
    <section className="card" aria-labelledby="reviews-heading">
      <div className="section-head">
        <div>
          <h2 id="reviews-heading">Reviews of {userName}</h2>
          {average && (
            <span className="muted small">
              <Stars value={Number(average)} size={14} /> {average} from {list.length} {list.length === 1 ? 'review' : 'reviews'}
            </span>
          )}
        </div>
        {canReview && !open && (
          <button type="button" className="button button-secondary button-small" onClick={() => setOpen(true)}>
            Rate and review
          </button>
        )}
      </div>

      {open && (
        <form onSubmit={submit} noValidate className="card" style={{ boxShadow: 'none', border: '1px solid var(--border)', marginBottom: '1rem' }}>
          <StarInput value={rating} onChange={setRating} error={errors.rating} />
          <TextAreaField label="Review (optional)" value={comment} maxLength={1000} onChange={(e) => setComment(e.target.value)} error={errors.comment} />
          {formError && (
            <p className="form-error" role="alert">
              {formError}
            </p>
          )}
          <div className="button-row">
            <button type="submit" className="button button-orange" disabled={saving}>
              {saving ? 'Saving…' : 'Submit review'}
            </button>
            <button type="button" className="button button-secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {reviews.loading ? (
        <Loading />
      ) : reviews.error ? (
        <ErrorState error={reviews.error} onRetry={reviews.reload} />
      ) : list.length === 0 ? (
        <p className="muted">No reviews yet.</p>
      ) : (
        list.map((r) => (
          <article className="review" key={r.id}>
            <div className="meta">
              <span className="rating-pill">
                {r.rating} <Icon name="star" size={12} />
              </span>
              <strong style={{ color: 'var(--text)' }}>{r.reviewerName}</strong>
              <span>· {formatDate(r.createdAt)}</span>
            </div>
            {r.comment && <p style={{ margin: '0.4rem 0 0' }}>{r.comment}</p>}
          </article>
        ))
      )}
    </section>
  );
}

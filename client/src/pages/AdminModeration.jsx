import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { Dialog, EmptyState, ErrorState, Loading, TextAreaField } from '../components/ui.jsx';
import { useAsync } from '../lib/useAsync.js';
import { formatDateTime } from '../lib/format.js';
import { listComplaints, listReports, resolveComplaint, resolveReport } from '../services/moderation.js';

const CONFIG = {
  reports: {
    title: 'Reports',
    load: listReports,
    resolve: resolveReport,
    empty: 'No reports to review',
  },
  complaints: {
    title: 'Complaints',
    load: listComplaints,
    resolve: resolveComplaint,
    empty: 'No complaints to review',
  },
};

function ResolveDialog({ item, removeListing, onCancel, onConfirm }) {
  const [note, setNote] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const confirm = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onConfirm(note.trim());
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <Dialog title={removeListing ? 'Remove listing and close' : 'Close without action'} onClose={onCancel}>
      <form onSubmit={confirm}>
        <p>
          {removeListing ? (
            <>
              “{item.listing?.title}” will be hidden from all students. The action is recorded with your name.
            </>
          ) : (
            'The listing stays active and this item is closed. The action is recorded with your name.'
          )}
        </p>
        <TextAreaField label="Note for the record (optional)" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="button-row">
          <button type="submit" className={`button ${removeListing ? 'button-outline-danger' : ''}`} disabled={saving}>
            {saving ? 'Saving…' : removeListing ? 'Remove listing' : 'Close'}
          </button>
          <button type="button" className="button button-secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/** UC-10 View Reports and UC-11 Remove Inappropriate Listings / Handle Complaints (admins only). */
export default function AdminModeration({ kind }) {
  const { user } = useAuth();
  const config = CONFIG[kind];
  const [params, setParams] = useSearchParams();
  const status = params.get('status') === 'closed' ? 'closed' : 'open';
  const items = useAsync(() => config.load(user, { status }), [user, status, config]);
  const [pending, setPending] = useState(null); // { item, removeListing }
  const [message, setMessage] = useState(null);

  const confirm = async (note) => {
    await config.resolve(user, pending.item.id, { removeListing: pending.removeListing, note });
    setMessage(pending.removeListing ? 'Listing removed and item closed.' : 'Item closed with no action.');
    setPending(null);
    items.reload();
  };

  return (
    <>
      <section className="card">
        <div className="section-head">
          <h1>{config.title}</h1>
          <div className="sort-bar" role="group" aria-label="Show">
            <button type="button" aria-pressed={status === 'open'} onClick={() => setParams({})}>
              Open
            </button>
            <button type="button" aria-pressed={status === 'closed'} onClick={() => setParams({ status: 'closed' })}>
              Closed
            </button>
          </div>
        </div>
        {message && (
          <p className="form-success" role="status">
            {message}
          </p>
        )}
        {items.loading ? (
          <Loading />
        ) : items.error ? (
          <ErrorState error={items.error} onRetry={items.reload} />
        ) : items.data.length === 0 ? (
          <EmptyState icon="shield" title={config.empty} />
        ) : (
          <div className="stack">
            {items.data.map((item) => {
              const listingGone = !item.listing || ['removed', 'deleted'].includes(item.listing.status);
              return (
                <article key={item.id} className="card" style={{ boxShadow: 'none', border: '1px solid var(--border)' }}>
                  <div className="meta" style={{ marginBottom: '0.4rem' }}>
                    <span className="tag tag-blue">{item.reason}</span>
                    <span className={`status status-${item.status}`}>{item.status}</span>
                    <span>· {formatDateTime(item.createdAt)}</span>
                  </div>
                  <dl className="details">
                    <dt>{kind === 'reports' ? 'Reported by' : 'Complaint by'}</dt>
                    <dd>{kind === 'reports' ? item.reporterName : item.complainantName}</dd>
                    {item.listing && (
                      <>
                        <dt>Listing</dt>
                        <dd>
                          {listingGone ? (
                            <>
                              {item.listing.title} <span className="status status-removed">({item.listing.status === 'deleted' ? 'deleted by seller' : 'removed'})</span>
                            </>
                          ) : (
                            <Link to={`/listings/${item.listing.id}`}>{item.listing.title}</Link>
                          )}{' '}
                          <span className="muted">by {item.listing.sellerName}</span>
                        </dd>
                      </>
                    )}
                    {item.reportedUserName && (
                      <>
                        <dt>Reported user</dt>
                        <dd>
                          {item.reportedUserName} <span className="muted small">(suspend from Manage users if needed)</span>
                        </dd>
                      </>
                    )}
                    {item.description && (
                      <>
                        <dt>Details</dt>
                        <dd>{item.description}</dd>
                      </>
                    )}
                  </dl>
                  {item.status === 'open' && (
                    <div className="button-row" style={{ marginTop: '1rem' }}>
                      {item.listing && !listingGone && (
                        <button type="button" className="button button-outline-danger button-small" onClick={() => setPending({ item, removeListing: true })}>
                          Remove listing &amp; close
                        </button>
                      )}
                      <button type="button" className="button button-secondary button-small" onClick={() => setPending({ item, removeListing: false })}>
                        {listingGone && item.listing ? 'Close (listing already removed)' : 'Close without action'}
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
      {pending && <ResolveDialog item={pending.item} removeListing={pending.removeListing} onCancel={() => setPending(null)} onConfirm={confirm} />}
    </>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';

const ROLE_LABELS = { buyer: 'Buyer', seller: 'Seller', admin: 'Administrator' };

const formatDate = (value) =>
  new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

export default function Profile() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setError(null);
    api('/profile')
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  useEffect(load, [load]);

  if (error) {
    return (
      <section className="card">
        <h1>Your profile</h1>
        <p className="form-error" role="alert">
          {error}
        </p>
        <button type="button" className="button" onClick={load}>
          Try again
        </button>
      </section>
    );
  }
  if (!data) return <p className="muted">Loading your profile…</p>;

  const { profile, activity } = data;
  return (
    <div className="stack">
      <section className="card">
        <h1>{profile.name}</h1>
        <dl className="details">
          <dt>University email</dt>
          <dd>{profile.email}</dd>
          <dt>Roles</dt>
          <dd>
            {profile.roles.map((role) => (
              <span key={role} className="badge">
                {ROLE_LABELS[role] ?? role}
              </span>
            ))}
          </dd>
          <dt>Member since</dt>
          <dd>{formatDate(profile.createdAt)}</dd>
        </dl>
      </section>

      <section className="card">
        <h2>Marketplace activity</h2>
        <ul className="stats">
          <li>
            <span className="stat-value">{activity.listingsPosted}</span>
            <span className="stat-label">Listings posted</span>
          </li>
          <li>
            <span className="stat-value">{activity.activeListings}</span>
            <span className="stat-label">Active listings</span>
          </li>
          <li>
            <span className="stat-value">{activity.bidsPlaced}</span>
            <span className="stat-label">Bids placed</span>
          </li>
          <li>
            <span className="stat-value">{activity.averageRating ?? '—'}</span>
            <span className="stat-label">
              Average rating ({activity.reviewsReceived} {activity.reviewsReceived === 1 ? 'review' : 'reviews'})
            </span>
          </li>
        </ul>
      </section>
    </div>
  );
}

import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import Icon from '../components/Icon.jsx';
import { EmptyState, ErrorState, Loading } from '../components/ui.jsx';
import { useAsync } from '../lib/useAsync.js';
import { timeAgo } from '../lib/format.js';
import { listNotifications, markAllNotificationsRead } from '../services/notifications.js';

/** Receive Winner Notification. Opening the page marks notifications as read. */
export default function Notifications() {
  const { user } = useAuth();
  const notifications = useAsync(() => listNotifications(user), [user]);

  useEffect(() => {
    if (notifications.data?.some((n) => !n.readAt)) markAllNotificationsRead(user).catch(() => {});
  }, [notifications.data, user]);

  return (
    <div className="medium">
      <section className="card">
        <h1>Notifications</h1>
        {notifications.loading ? (
          <Loading />
        ) : notifications.error ? (
          <ErrorState error={notifications.error} onRetry={notifications.reload} />
        ) : notifications.data.length === 0 ? (
          <EmptyState icon="bell" title="No notifications yet">
            <p>We’ll tell you here when you win an auction.</p>
          </EmptyState>
        ) : (
          notifications.data.map((n) => (
            <article key={n.id} className="review" style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
              <span className="category-icon" style={{ background: '#fff8e1', color: 'var(--amber)' }}>
                <Icon name="trophy" />
              </span>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontWeight: n.readAt ? 400 : 600 }}>{n.message}</p>
                <span className="muted small">{timeAgo(n.createdAt)}</span>
                {n.auctionId && (
                  <div>
                    <Link to={`/auctions/${n.auctionId}`} className="small">
                      View auction
                    </Link>
                  </div>
                )}
              </div>
              {!n.readAt && <span className="unread-dot" aria-label="New" />}
            </article>
          ))
        )}
      </section>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { ApiError } from '../api.js';
import Icon from '../components/Icon.jsx';
import { EmptyState, ErrorState, Loading } from '../components/ui.jsx';
import { useAsync } from '../lib/useAsync.js';
import { onMessagesChanged } from '../lib/socket.js';
import { formatDateTime, formatPrice, initials, timeAgo } from '../lib/format.js';
import { getConversation, listConversations, sendMessage } from '../services/messages.js';

function Thread({ listingId, buyerId, onSent }) {
  const { user } = useAuth();
  const thread = useAsync(() => getConversation(user, listingId, buyerId), [user, listingId, buyerId]);
  const [text, setText] = useState('');
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const bottom = useRef(null);
  const { reload: reloadThread } = thread;

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [thread.data?.messages.length]);

  // Live updates: reload this conversation when the server says it changed (e.g. a new reply).
  useEffect(
    () =>
      onMessagesChanged((change) => {
        if (change?.listingId === Number(listingId) && change?.buyerId === Number(buyerId)) reloadThread();
      }),
    [listingId, buyerId, reloadThread],
  );

  if (thread.loading && !thread.data) return <div className="thread"><Loading label="Loading conversation…" /></div>;
  if (thread.error) {
    return (
      <div className="thread" style={{ padding: '1rem' }}>
        <ErrorState error={thread.error} onRetry={thread.error.status >= 500 || thread.error.status === 0 ? thread.reload : undefined} />
      </div>
    );
  }

  const t = thread.data;
  const send = async (event) => {
    event.preventDefault();
    setError(null);
    setSending(true);
    try {
      const message = await sendMessage(user, listingId, buyerId, text);
      thread.setData((d) => ({ ...d, messages: [...d.messages, message] }));
      setText('');
      onSent?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.fieldErrors.content ?? err.message : 'Message could not be sent. Try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="thread">
      <div className="thread-head">
        <div>
          <Link to="/messages" className="small" style={{ display: 'inline-block', marginBottom: '0.2rem' }}>
            ← All conversations
          </Link>
          <div>
            <strong>{t.otherName}</strong>
          </div>
          {['active', 'in_auction'].includes(t.listing.status) ? (
            <Link to={`/listings/${t.listing.id}`} className="small">
              {t.listing.title} · {formatPrice(t.listing.price)}
            </Link>
          ) : (
            <span className="small muted">{t.listing.title} (no longer available)</span>
          )}
        </div>
      </div>
      <div className="thread-body" aria-live="polite">
        {t.messages.length === 0 ? (
          <p className="muted center">Ask the seller about the item, its condition or where to meet.</p>
        ) : (
          t.messages.map((m) => (
            <div key={m.id} className={`bubble${m.isMine ? ' bubble-mine' : ''}`}>
              {m.content}
              <time dateTime={m.sentAt}>{formatDateTime(m.sentAt)}</time>
            </div>
          ))
        )}
        <div ref={bottom} />
      </div>
      {t.canSend ? (
        <form className="thread-form" onSubmit={send} noValidate>
          <label htmlFor="message-text" className="sr-only">
            Message
          </label>
          <textarea
            id="message-text"
            value={text}
            maxLength={2000}
            placeholder="Write a message…"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form.requestSubmit();
              }
            }}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'message-error' : undefined}
          />
          <button type="submit" className="button button-orange" disabled={sending}>
            Send
          </button>
        </form>
      ) : (
        <p className="form-info" style={{ margin: '0.75rem 1rem' }}>
          Messaging is unavailable because this listing was removed.
        </p>
      )}
      {error && (
        <p id="message-error" className="field-error" role="alert" style={{ padding: '0 1rem 0.75rem', margin: 0 }}>
          {error}
        </p>
      )}
    </div>
  );
}

/** UC-05 Contact Seller / Send Message. */
export default function Messages() {
  const { listingId, buyerId } = useParams();
  const { user } = useAuth();
  const conversations = useAsync(() => listConversations(user), [user]);
  const open = Boolean(listingId && buyerId);
  const { reload } = conversations;

  // Live updates: refresh previews and unread dots whenever any of the user's conversations changes.
  useEffect(() => onMessagesChanged(() => reload()), [reload]);

  return (
    <>
      <div className="messages-layout" data-thread-open={open}>
        <nav className="conversation-list" aria-label="Conversations">
          <div className="thread-head">
            <h1 style={{ margin: 0, fontSize: '1.15rem' }}>Messages</h1>
          </div>
          {conversations.loading && !conversations.data ? (
            <Loading />
          ) : conversations.error ? (
            <div style={{ padding: '1rem' }}>
              <ErrorState error={conversations.error} onRetry={conversations.reload} />
            </div>
          ) : conversations.data.length === 0 ? (
            <p className="muted" style={{ padding: '1rem' }}>
              No conversations yet. Use “Contact seller” on a listing to start one.
            </p>
          ) : (
            conversations.data.map((c) => {
              const current = String(c.listingId) === listingId && String(c.buyerId) === buyerId;
              return (
                <Link key={`${c.listingId}-${c.buyerId}`} to={`/messages/${c.listingId}/${c.buyerId}`} aria-current={current ? 'page' : undefined}>
                  <span className="avatar">{initials(c.otherName)}</span>
                  <span className="conversation-preview">
                    <strong>{c.otherName}</strong> <span className="tag tag-grey">{c.role === 'buying' ? 'Buying' : 'Selling'}</span>
                    <p>{c.listingTitle}</p>
                    <p>
                      {c.lastMessage.senderId === user.id ? 'You: ' : ''}
                      {c.lastMessage.content}
                    </p>
                    <span className="muted small">{timeAgo(c.lastMessage.sentAt)}</span>
                  </span>
                  {c.unread && !current && <span className="unread-dot" aria-label="Unread" />}
                </Link>
              );
            })
          )}
        </nav>
        {open ? (
          <Thread key={`${listingId}-${buyerId}`} listingId={listingId} buyerId={buyerId} onSent={reload} />
        ) : (
          <div className="thread">
            <EmptyState icon="chat" title="Select a conversation">
              <p>Your chats with buyers and sellers appear here.</p>
            </EmptyState>
          </div>
        )}
      </div>
      <p className="muted small" style={{ marginTop: '0.75rem' }}>
        <Icon name="shield" size={14} style={{ verticalAlign: '-2px' }} /> Keep conversations about marketplace items and meet in public places on campus.
      </p>
    </>
  );
}

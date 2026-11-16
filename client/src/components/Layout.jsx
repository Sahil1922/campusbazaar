import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { hasRole, useAuth } from '../auth.jsx';
import Icon from './Icon.jsx';
import { onDataChange } from '../lib/events.js';
import { onNotificationsChanged } from '../lib/socket.js';
import { categoryStyle, useCategories } from '../lib/categories.js';
import { useLoginPrompt } from '../lib/loginPrompt.js';
import { unreadConversationCount } from '../services/messages.js';
import { unreadNotificationCount } from '../services/notifications.js';

/** `onSearch(path)` replaces navigation, e.g. to ask signed-out visitors to log in first. */
function HeaderSearch({ onSearch }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [q, setQ] = useState(location.pathname === '/listings' ? (params.get('q') ?? '') : '');

  useEffect(() => {
    if (location.pathname === '/listings') setQ(params.get('q') ?? '');
  }, [location.pathname, params]);

  const submit = (event) => {
    event.preventDefault();
    const next = new URLSearchParams(location.pathname === '/listings' ? params : undefined);
    if (q.trim()) next.set('q', q.trim());
    else next.delete('q');
    const path = `/listings?${next}`;
    if (onSearch) onSearch(path);
    else navigate(path);
  };

  return (
    <form className="header-search" role="search" onSubmit={submit}>
      <label htmlFor="site-search" className="sr-only">
        Search listings
      </label>
      <input
        id="site-search"
        type="search"
        placeholder="Search for books, electronics, furniture and more"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        maxLength={100}
      />
      <button type="submit" aria-label="Search">
        <Icon name="search" />
      </button>
    </form>
  );
}

function AccountMenu({ user, onSignOut }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="menu" ref={ref}>
      <button type="button" className="nav-button" aria-expanded={open} aria-haspopup="true" aria-label={`Account menu for ${user.name}`} onClick={() => setOpen((o) => !o)}>
        <Icon name="user" />
        <span className="nav-text">{user.name.split(' ')[0]}</span>
        <Icon name="chevronDown" size={16} />
      </button>
      {open && (
        <div className="menu-panel">
          <Link to="/profile">My profile</Link>
          <Link to="/my/listings">My listings</Link>
          <Link to="/notifications">Notifications</Link>
          {hasRole(user, 'admin') && (
            <>
              <div className="menu-label">Administrator</div>
              <Link to="/admin/users">Manage users</Link>
              <Link to="/admin/reports">Reports</Link>
              <Link to="/admin/complaints">Complaints</Link>
            </>
          )}
          <button type="button" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function useCounts(user) {
  const [counts, setCounts] = useState({ messages: 0, notifications: 0 });
  const location = useLocation();
  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;
    const refresh = () =>
      Promise.all([unreadConversationCount(user), unreadNotificationCount(user)])
        .then(([messages, notifications]) => !cancelled && setCounts({ messages, notifications }))
        .catch(() => {});
    refresh();
    const off = onDataChange(refresh);
    const offSocket = onNotificationsChanged(refresh);
    return () => {
      cancelled = true;
      off();
      offSocket();
    };
  }, [user, location.pathname]);
  return counts;
}

function CategoryBar({ user }) {
  const categories = useCategories(user);
  const [params] = useSearchParams();
  const location = useLocation();
  const current = location.pathname === '/listings' ? params.get('category') : null;
  return (
    <nav className="category-bar" aria-label="Categories">
      <ul>
        <li>
          <Link to="/listings" className={location.pathname === '/listings' && !current ? 'active' : undefined}>
            <span className="category-icon">
              <Icon name="grid" />
            </span>
            All items
          </Link>
        </li>
        {categories.map((c) => (
          <li key={c.id}>
            <Link to={`/listings?category=${c.id}`} className={current === String(c.id) ? 'active' : undefined}>
              <span className="category-icon">
                <Icon name={categoryStyle(c.name).icon} />
              </span>
              {c.name}
            </Link>
          </li>
        ))}
        <li>
          <Link to="/auctions" className={location.pathname.startsWith('/auctions') ? 'active' : undefined}>
            <span className="category-icon category-icon-live">
              <Icon name="gavel" />
            </span>
            Live auctions
          </Link>
        </li>
      </ul>
    </nav>
  );
}

export default function Layout() {
  const { user, signOut } = useAuth();
  const { openLogin } = useLoginPrompt();
  const navigate = useNavigate();
  const counts = useCounts(user);

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <div className="app">
      <header className="site-header">
        <div className="container header-inner">
          <Link to="/" className="brand" aria-label="CampusBazaar home">
            <span className="brand-name">
              Campus<span>Bazaar</span>
            </span>
            <span className="brand-tag">Students only marketplace</span>
          </Link>
          {user ? (
            <HeaderSearch />
          ) : (
            <HeaderSearch onSearch={(path) => openLogin({ next: path, reason: 'Sign in to search everything for sale on your campus.' })} />
          )}
          <nav className="nav" aria-label="Main">
            {user ? (
              <>
                <NavLink to="/auctions" className="nav-live" aria-label="Live auctions">
                  <Icon name="gavel" />
                  <span className="nav-text">Auctions</span>
                </NavLink>
                <NavLink to="/sell" aria-label="Sell an item">
                  <Icon name="plus" />
                  <span className="nav-text">Sell</span>
                </NavLink>
                <NavLink to="/messages" aria-label={`Messages${counts.messages ? `, ${counts.messages} unread` : ''}`}>
                  <Icon name="chat" />
                  <span className="nav-text">Messages</span>
                  {counts.messages > 0 && <span className="nav-count">{counts.messages}</span>}
                </NavLink>
                <NavLink to="/notifications" aria-label={`Notifications${counts.notifications ? `, ${counts.notifications} unread` : ''}`}>
                  <Icon name="bell" />
                  {counts.notifications > 0 && <span className="nav-count">{counts.notifications}</span>}
                </NavLink>
                <AccountMenu user={user} onSignOut={handleSignOut} />
              </>
            ) : (
              <>
                <button type="button" className="nav-button nav-login" onClick={() => openLogin()}>
                  Login
                </button>
                <button
                  type="button"
                  className="nav-button"
                  aria-label="Sell an item"
                  onClick={() => openLogin({ next: '/sell', reason: 'Sign in to list your item for students on your campus.' })}
                >
                  <Icon name="plus" />
                  <span className="nav-text">Sell</span>
                </button>
              </>
            )}
          </nav>
        </div>
      </header>
      {user && <CategoryBar user={user} />}
      <main className="container main">
        <Outlet />
      </main>
    </div>
  );
}

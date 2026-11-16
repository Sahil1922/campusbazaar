import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import HeroCarousel from '../components/HeroCarousel.jsx';
import Icon from '../components/Icon.jsx';
import { AuctionCard, ErrorState, ListingCard, Loading } from '../components/ui.jsx';
import { categoryStyle } from '../lib/categories.js';
import { useLoginPrompt } from '../lib/loginPrompt.js';
import { useAsync } from '../lib/useAsync.js';
import { searchListings } from '../services/listings.js';
import { listAuctions } from '../services/auctions.js';
import { getPublicHome } from '../services/public.js';

const FEATURES = [
  { icon: 'shield', title: 'Verified students only', text: 'Every account is checked with a university email.' },
  { icon: 'search', title: 'Find it fast', text: 'Search and filter by category, condition and price.' },
  { icon: 'chat', title: 'Chat with sellers', text: 'Ask questions and arrange pickup on campus.' },
  { icon: 'gavel', title: 'Live auctions', text: 'Bid in real time on items sellers put up for auction.', live: true },
];

const REASONS = {
  item: 'Sign in to see the full details of this item and contact the seller.',
  auction: 'Sign in to follow this auction and place your bid.',
  category: 'Sign in to browse everything in this category.',
  sell: 'Sign in to list your item for students on your campus.',
};

/** Home page for signed-out visitors: real listing cards; opening anything asks them to log in. */
function Welcome() {
  const navigate = useNavigate();
  const { openLogin } = useLoginPrompt();
  const home = useAsync(() => getPublicHome(), []);

  const openItem = (path) => openLogin({ next: path, reason: path.startsWith('/auctions') ? REASONS.auction : REASONS.item });

  const slides = [
    {
      id: 'sell',
      tone: 'blue',
      icon: 'book',
      title: 'Semester over? Turn old books into cash',
      text: 'Snap a photo, set your price and reach students on your own campus in minutes.',
      cta: { label: 'Start selling', onClick: () => openLogin({ next: '/sell', reason: REASONS.sell }) },
    },
    {
      id: 'auctions',
      tone: 'red',
      icon: 'gavel',
      badge: 'LIVE',
      title: 'Live auctions on campus',
      text: 'Bid in real time. When the timer runs out, the highest bid wins.',
      cta: { label: 'See live auctions', onClick: () => openLogin({ next: '/auctions', reason: REASONS.auction }) },
    },
    {
      id: 'verified',
      tone: 'amber',
      icon: 'shield',
      title: 'Only verified university students',
      text: 'Every account is checked with a university email, so you know who you are dealing with.',
      cta: { label: 'Create your account', onClick: () => navigate('/register') },
    },
  ];

  const data = home.data;
  return (
    <div className="stack">
      <HeroCarousel slides={slides} label="CampusBazaar highlights" />

      {data?.categories?.length > 0 && (
        <nav className="card category-tiles" aria-label="Shop by category">
          {data.categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => openLogin({ next: `/listings?category=${c.id}`, reason: REASONS.category })}
            >
              <span className="category-icon" style={{ background: `${categoryStyle(c.name).color}1f`, color: categoryStyle(c.name).color }}>
                <Icon name={categoryStyle(c.name).icon} size={26} />
              </span>
              {c.name}
            </button>
          ))}
        </nav>
      )}

      {home.loading ? (
        <Loading label="Loading what's on sale…" />
      ) : home.error ? (
        <ErrorState error={home.error} onRetry={home.reload} />
      ) : (
        <>
          {data.liveAuctions.length > 0 && (
            <section className="shelf shelf-live" aria-labelledby="public-live-heading">
              <div className="shelf-head">
                <h2 id="public-live-heading">
                  <span className="live-badge">LIVE</span> Auctions ending soon
                </h2>
                <button type="button" className="button button-red button-small" onClick={() => openLogin({ next: '/auctions', reason: REASONS.auction })}>
                  View all
                </button>
              </div>
              <div className="shelf-body">
                <div className="grid">
                  {data.liveAuctions.map((l) => (
                    <ListingCard key={l.id} listing={l} onOpen={openItem} />
                  ))}
                </div>
              </div>
            </section>
          )}

          <section className="shelf" aria-labelledby="public-fresh-heading">
            <div className="shelf-head">
              <h2 id="public-fresh-heading">
                Fresh on campus
                {data.totalListings > 0 && <span className="muted small shelf-count">{data.totalListings} {data.totalListings === 1 ? 'item' : 'items'} for sale</span>}
              </h2>
              <button type="button" className="button button-small" onClick={() => openLogin({ next: '/listings', reason: REASONS.category })}>
                View all
              </button>
            </div>
            <div className="shelf-body">
              {data.listings.length === 0 ? (
                <p className="muted">
                  Nothing listed yet. <Link to="/register">Join</Link> and be the first to sell something!
                </p>
              ) : (
                <div className="grid">
                  {data.listings.map((l) => (
                    <ListingCard key={l.id} listing={l} onOpen={openItem} />
                  ))}
                </div>
              )}
            </div>
          </section>
        </>
      )}

      <section className="card feature-strip" aria-label="Why CampusBazaar">
        {FEATURES.map((f) => (
          <div className="feature" key={f.title}>
            <span className={`category-icon${f.live ? ' category-icon-live' : ''}`}>
              <Icon name={f.icon} />
            </span>
            <div>
              <strong>{f.title}</strong>
              <p>{f.text}</p>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

function Dashboard({ user }) {
  const auctions = useAsync(() => listAuctions(user, { status: 'active' }), [user]);
  const fresh = useAsync(() => searchListings(user, { sort: 'newest' }), [user]);

  return (
    <div className="stack">
      <section className="hero">
        <h1>Hi {user.name.split(' ')[0]}, what are you looking for today?</h1>
        <div className="button-row">
          <Link to="/listings" className="button button-amber">
            Browse all items
          </Link>
          <Link to="/sell" className="button button-orange">
            <Icon name="plus" size={18} /> Sell an item
          </Link>
        </div>
      </section>

      <section className="shelf shelf-live" aria-labelledby="live-heading">
        <div className="shelf-head">
          <h2 id="live-heading">
            <span className="live-badge">LIVE</span> Auctions ending soon
          </h2>
          <Link to="/auctions" className="button button-red button-small">
            View all
          </Link>
        </div>
        <div className="shelf-body">
          {auctions.loading ? (
            <Loading />
          ) : auctions.error ? (
            <ErrorState error={auctions.error} onRetry={auctions.reload} />
          ) : auctions.data.length === 0 ? (
            <p className="muted">No live auctions right now.</p>
          ) : (
            <div className="grid">
              {auctions.data.slice(0, 5).map((a) => (
                <AuctionCard key={a.id} auction={a} />
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="shelf" aria-labelledby="fresh-heading">
        <div className="shelf-head">
          <h2 id="fresh-heading">Freshly listed</h2>
          <Link to="/listings" className="button button-small">
            View all
          </Link>
        </div>
        <div className="shelf-body">
          {fresh.loading ? (
            <Loading />
          ) : fresh.error ? (
            <ErrorState error={fresh.error} onRetry={fresh.reload} />
          ) : (
            <div className="grid">
              {fresh.data.listings.length === 0 && <p className="muted">Nothing listed yet. Be the first to sell something!</p>}
              {fresh.data.listings
                .slice(0, 10)
                .map((l) => (
                  <ListingCard key={l.id} listing={l} />
                ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export default function Home() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  return user ? <Dashboard user={user} /> : <Welcome />;
}

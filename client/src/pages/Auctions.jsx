import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { AuctionCard, EmptyState, ErrorState, Loading } from '../components/ui.jsx';
import { useAsync } from '../lib/useAsync.js';
import { listAuctions } from '../services/auctions.js';

export default function Auctions() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') === 'ended' ? 'ended' : 'active';
  const auctions = useAsync(() => listAuctions(user, { status }), [user, status]);

  return (
    <>
      <section className="card">
        <div className="section-head">
          <h1>{status === 'active' ? <><span className="live-badge">LIVE</span> Auctions</> : 'Ended auctions'}</h1>
          <div className="sort-bar" role="group" aria-label="Show">
            <button type="button" aria-pressed={status === 'active'} onClick={() => setParams({})}>
              Live now
            </button>
            <button type="button" aria-pressed={status === 'ended'} onClick={() => setParams({ status: 'ended' })}>
              Ended
            </button>
          </div>
        </div>
        {auctions.loading ? (
          <Loading />
        ) : auctions.error ? (
          <ErrorState error={auctions.error} onRetry={auctions.reload} />
        ) : auctions.data.length === 0 ? (
          <EmptyState icon="gavel" title={status === 'active' ? 'No live auctions right now' : 'No ended auctions yet'}>
            <p>Sellers can start an auction from any of their active listings.</p>
          </EmptyState>
        ) : (
          <div className="grid">
            {auctions.data.map((a) => (
              <AuctionCard key={a.id} auction={a} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

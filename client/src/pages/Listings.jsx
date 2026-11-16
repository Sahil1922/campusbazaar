import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import Icon from '../components/Icon.jsx';
import { EmptyState, ErrorState, ListingCard, Loading } from '../components/ui.jsx';
import { useAsync } from '../lib/useAsync.js';
import { CONDITIONS } from '../lib/format.js';
import { useCategories } from '../lib/categories.js';
import { searchListings } from '../services/listings.js';

const SORTS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'price_asc', label: 'Price — low to high' },
  { value: 'price_desc', label: 'Price — high to low' },
];

/** UC-03 View Listings + UC-04 Search and Filter Items. Filters live in the URL so results can be shared. */
export default function Listings() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const categories = useCategories(user);

  const q = params.get('q') ?? '';
  const category = params.get('category') ?? '';
  const conditions = (params.get('condition') ?? '').split(',').filter(Boolean);
  const minPrice = params.get('min') ?? '';
  const maxPrice = params.get('max') ?? '';
  const sort = params.get('sort') ?? 'newest';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const conditionKey = conditions.join(',');

  const [priceDraft, setPriceDraft] = useState({ min: minPrice, max: maxPrice });
  useEffect(() => setPriceDraft({ min: minPrice, max: maxPrice }), [minPrice, maxPrice]);

  const results = useAsync(
    () => searchListings(user, { q, category, conditions: conditionKey ? conditionKey.split(',') : [], minPrice, maxPrice, sort, page }),
    [user, q, category, conditionKey, minPrice, maxPrice, sort, page],
  );

  const update = (changes) => {
    const next = new URLSearchParams(params);
    if (!('page' in changes)) next.delete('page');
    for (const [key, value] of Object.entries(changes)) {
      if (value === '' || value === null || value === undefined) next.delete(key);
      else next.set(key, value);
    }
    setParams(next);
  };

  const toggleCondition = (value) => {
    const set = new Set(conditions);
    if (set.has(value)) set.delete(value);
    else set.add(value);
    update({ condition: [...set].join(',') });
  };

  const applyPrice = (event) => {
    event.preventDefault();
    update({ min: priceDraft.min, max: priceDraft.max });
  };

  const categoryName = categories.find((c) => String(c.id) === category)?.name;
  const heading = q ? `Results for “${q}”` : categoryName ?? 'All items';
  const hasFilters = Boolean(category || conditions.length || minPrice || maxPrice);

  return (
    <>
      <div className="browse">
        <aside className="card filters" data-open={filtersOpen} aria-label="Filters">
          <div className="section-head" style={{ marginBottom: 0, borderBottom: 'none', paddingBottom: 0 }}>
            <h2>Filters</h2>
            {hasFilters && (
              <button type="button" className="link-button small" onClick={() => setParams(q ? { q } : {})}>
                Clear all
              </button>
            )}
            <button
              type="button"
              className="button button-secondary button-small filter-toggle"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((o) => !o)}
            >
              <Icon name="filter" size={16} /> {filtersOpen ? 'Hide' : 'Show'}
            </button>
          </div>
          <div className="filter-body">
            <fieldset className="filter-group">
              <legend className="sr-only">Category</legend>
              <h3 aria-hidden="true">Category</h3>
              <div className="radio-list">
                <label>
                  <input type="radio" name="category" checked={!category} onChange={() => update({ category: '' })} /> All categories
                </label>
                {categories.map((c) => (
                  <label key={c.id}>
                    <input type="radio" name="category" checked={category === String(c.id)} onChange={() => update({ category: c.id })} />{' '}
                    {c.name}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="filter-group">
              <legend className="sr-only">Condition</legend>
              <h3 aria-hidden="true">Condition</h3>
              <div className="radio-list">
                {CONDITIONS.map((c) => (
                  <label key={c.value}>
                    <input type="checkbox" checked={conditions.includes(c.value)} onChange={() => toggleCondition(c.value)} /> {c.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <form className="filter-group" onSubmit={applyPrice}>
              <h3>Price (₹)</h3>
              <div className="field-row" style={{ gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <div className="field">
                  <label htmlFor="min-price" className="sr-only">
                    Minimum price
                  </label>
                  <input id="min-price" type="number" min="0" inputMode="decimal" placeholder="Min" value={priceDraft.min} onChange={(e) => setPriceDraft((p) => ({ ...p, min: e.target.value }))} />
                </div>
                <div className="field">
                  <label htmlFor="max-price" className="sr-only">
                    Maximum price
                  </label>
                  <input id="max-price" type="number" min="0" inputMode="decimal" placeholder="Max" value={priceDraft.max} onChange={(e) => setPriceDraft((p) => ({ ...p, max: e.target.value }))} />
                </div>
              </div>
              <button type="submit" className="button button-small full">
                Apply price
              </button>
            </form>
          </div>
        </aside>

        <section className="card" aria-labelledby="results-heading">
          <div className="section-head">
            <div>
              <h1 id="results-heading">{heading}</h1>
              {results.data && (
                <span className="muted small">
                  {results.data.total} {results.data.total === 1 ? 'item' : 'items'}
                </span>
              )}
            </div>
            <div className="sort-bar" role="group" aria-label="Sort by">
              <span className="muted">Sort by</span>
              {SORTS.map((s) => (
                <button key={s.value} type="button" aria-pressed={sort === s.value} onClick={() => update({ sort: s.value === 'newest' ? '' : s.value })}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          {results.loading ? (
            <Loading label="Finding items…" />
          ) : results.error ? (
            <ErrorState error={results.error} onRetry={results.reload} />
          ) : results.data.listings.length === 0 ? (
            <EmptyState title="No items match your search">
              <p>Try different words or remove some filters.</p>
            </EmptyState>
          ) : (
            <div className="grid">
              {results.data.listings.map((l) => (
                <ListingCard key={l.id} listing={l} />
              ))}
            </div>
          )}
          {results.data && results.data.total > results.data.pageSize && (
            <nav className="pager" aria-label="Pages">
              <button type="button" className="button button-secondary button-small" disabled={page <= 1} onClick={() => update({ page: page - 1 > 1 ? page - 1 : '' })}>
                Previous
              </button>
              <span className="muted small">
                Page {page} of {Math.ceil(results.data.total / results.data.pageSize)}
              </span>
              <button type="button" className="button button-secondary button-small" disabled={page * results.data.pageSize >= results.data.total} onClick={() => update({ page: page + 1 })}>
                Next
              </button>
            </nav>
          )}
        </section>
      </div>
    </>
  );
}

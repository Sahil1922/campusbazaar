import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { ApiError } from '../api.js';
import Field from '../components/Field.jsx';
import Icon from '../components/Icon.jsx';
import { ErrorState, Loading, SelectField, TextAreaField } from '../components/ui.jsx';
import { CONDITIONS } from '../lib/format.js';
import { useCategories } from '../lib/categories.js';
import { createListing, getListing, updateListing } from '../services/listings.js';

// Same limits as the server, checked here only to give quicker feedback.
const MAX_IMAGES = 5;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const EMPTY = { title: '', description: '', categoryId: '', condition: '', price: '', priceNegotiable: false };

let previewKey = 0;

/** UC-02 Create Listing, and Edit Listing when an id is in the URL. */
export default function ListingForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const { user } = useAuth();
  const categories = useCategories(user);
  const navigate = useNavigate();
  const fileInput = useRef(null);
  const [form, setForm] = useState(EMPTY);
  // Photos: saved ones are { key, id, url }; newly chosen ones are { key, file, url } with a local preview URL.
  const [images, setImages] = useState([]);
  const [loadState, setLoadState] = useState(editing ? 'loading' : 'ready');
  const [loadError, setLoadError] = useState(null);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Release local preview URLs when they are no longer shown.
  const imagesRef = useRef(images);
  imagesRef.current = images;
  useEffect(() => () => imagesRef.current.forEach((img) => img.file && URL.revokeObjectURL(img.url)), []);

  useEffect(() => {
    if (!editing) return undefined;
    let cancelled = false;
    getListing(user, id)
      .then((l) => {
        if (cancelled) return;
        if (l.sellerId !== user.id) throw new ApiError(403, 'You can only edit your own listings.');
        if (l.status !== 'active') throw new ApiError(409, 'Listings that are in an auction or sold cannot be edited.');
        setForm({ title: l.title, description: l.description, categoryId: String(l.categoryId), condition: l.condition, price: String(l.price), priceNegotiable: l.priceNegotiable });
        setImages(l.images.map((img) => ({ key: `saved-${img.id}`, id: img.id, url: img.url })));
        setLoadState('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err);
        setLoadState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [editing, id, user]);

  const update = (field) => (event) => setForm((f) => ({ ...f, [field]: event.target.value }));

  const addImages = (event) => {
    const files = [...event.target.files];
    event.target.value = '';
    const problems = [];
    const room = MAX_IMAGES - images.length;
    const accepted = [];
    for (const file of files) {
      if (!IMAGE_TYPES.includes(file.type)) problems.push(`${file.name}: use JPG, PNG or WebP.`);
      else if (file.size > MAX_IMAGE_BYTES) problems.push(`${file.name}: must be 5 MB or smaller.`);
      else if (accepted.length >= room) problems.push(`You can add at most ${MAX_IMAGES} photos.`);
      else accepted.push({ key: `new-${(previewKey += 1)}`, file, url: URL.createObjectURL(file) });
    }
    setImages((list) => [...list, ...accepted]);
    setErrors((e) => ({ ...e, images: [...new Set(problems)].join(' ') || undefined }));
  };

  const removeImage = (key) =>
    setImages((list) => {
      const target = list.find((img) => img.key === key);
      if (target?.file) URL.revokeObjectURL(target.url);
      return list.filter((img) => img.key !== key);
    });

  const submit = async (event) => {
    event.preventDefault();
    setErrors({});
    setFormError(null);
    setSaving(true);
    try {
      const input = { ...form, images };
      const saved = editing ? await updateListing(user, id, input) : await createListing(user, input);
      navigate(`/listings/${saved.id}`, { replace: true });
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'Something went wrong. Your details are kept — try again.');
      setErrors(e.fieldErrors);
      setFormError(Object.keys(e.fieldErrors).length ? 'Please correct the highlighted fields.' : e.message);
      setSaving(false);
    }
  };

  if (loadState === 'loading') return <Loading label="Loading listing…" />;
  if (loadState === 'error') {
    return (
      <div className="medium">
        <ErrorState error={loadError} />
        <Link to="/my/listings">← Back to my listings</Link>
      </div>
    );
  }

  return (
    <div className="medium">
      <section className="card">
        <h1>{editing ? 'Edit listing' : 'Sell an item'}</h1>
        <p className="muted">Fill in the details buyers need. All fields except photos are required.</p>
        <form onSubmit={submit} noValidate>
          <Field label="Item name" value={form.title} onChange={update('title')} maxLength={120} required error={errors.title} placeholder="e.g. Casio fx-991EX calculator" />
          <TextAreaField
            label="Description"
            value={form.description}
            onChange={update('description')}
            maxLength={2000}
            rows={5}
            required
            error={errors.description}
            hint="Mention condition details, what is included and where to pick up."
          />
          <div className="field-row">
            <SelectField label="Category" value={form.categoryId} onChange={update('categoryId')} required error={errors.categoryId}>
              <option value="">Choose a category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectField>
            <SelectField label="Condition" value={form.condition} onChange={update('condition')} required error={errors.condition}>
              <option value="">Choose the condition</option>
              {CONDITIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </SelectField>
            <Field label="Price (₹)" type="number" inputMode="decimal" min="1" step="0.01" value={form.price} onChange={update('price')} required error={errors.price} />
          </div>
          <div className="field radio-list">
            <label>
              <input
                type="checkbox"
                checked={form.priceNegotiable}
                onChange={(e) => setForm((f) => ({ ...f, priceNegotiable: e.target.checked }))}
              />
              <span>
                <strong>Price is negotiable</strong>
                <br />
                <span className="muted small">Shows a “Negotiable” tag so buyers know they can message you with an offer.</span>
              </span>
            </label>
            {errors.priceNegotiable && (
              <p className="field-error" role="alert">
                {errors.priceNegotiable}
              </p>
            )}
          </div>

          <div className="field">
            <span style={{ display: 'block', fontWeight: 500, fontSize: '0.9rem', marginBottom: '0.35rem' }}>
              Photos (optional, up to {MAX_IMAGES})
            </span>
            <div className="upload-grid">
              {images.map((img, i) => (
                <div className="upload-thumb" key={img.key}>
                  <img className="photo" src={img.url} alt={`Photo ${i + 1}`} />
                  <button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => removeImage(img.key)}>
                    ×
                  </button>
                </div>
              ))}
              {images.length < MAX_IMAGES && (
                <button type="button" className="upload-add" onClick={() => fileInput.current?.click()}>
                  <Icon name="image" size={24} />
                  Add photo
                </button>
              )}
            </div>
            <input ref={fileInput} type="file" accept={IMAGE_TYPES.join(',')} multiple hidden onChange={addImages} />
            <p className="hint">JPG, PNG or WebP, 5 MB each at most. The first photo is the cover.</p>
            {errors.images && (
              <p className="field-error" role="alert">
                {errors.images}
              </p>
            )}
          </div>

          {formError && (
            <p className="form-error" role="alert">
              {formError}
            </p>
          )}
          <div className="button-row">
            <button type="submit" className="button button-orange button-large" disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Publish listing'}
            </button>
            <Link to={editing ? `/listings/${id}` : '/'} className="button button-secondary button-large">
              Cancel
            </Link>
          </div>
        </form>
      </section>
    </div>
  );
}

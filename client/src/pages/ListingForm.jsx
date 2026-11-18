import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { ApiError } from '../api.js';
import CameraDialog from '../components/CameraDialog.jsx';
import Field from '../components/Field.jsx';
import Icon from '../components/Icon.jsx';
import { ErrorState, Loading, SelectField, TextAreaField } from '../components/ui.jsx';
import { CONDITIONS } from '../lib/format.js';
import { useCategories } from '../lib/categories.js';
import { shrinkPhoto } from '../lib/photos.js';
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
  const cameraInput = useRef(null);
  const [form, setForm] = useState(EMPTY);
  // Photos: saved ones are { key, id, url }; newly chosen ones are { key, file, url } with a local preview URL.
  const [images, setImages] = useState([]);
  const [loadState, setLoadState] = useState(editing ? 'loading' : 'ready');
  const [loadError, setLoadError] = useState(null);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [preparingPhotos, setPreparingPhotos] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const closeCamera = useCallback(() => setCameraOpen(false), []);

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

  // Photos from the file picker or the camera. Big photos are shrunk first (see lib/photos.js),
  // so the 5 MB limit applies to the photo that is actually uploaded.
  const addFiles = async (files) => {
    const problems = [];
    const room = MAX_IMAGES - imagesRef.current.length;
    const accepted = [];
    setPreparingPhotos(true);
    try {
      for (const original of files) {
        if (!IMAGE_TYPES.includes(original.type)) {
          problems.push(`${original.name}: use JPG, PNG or WebP.`);
          continue;
        }
        if (accepted.length >= room) {
          problems.push(`You can add at most ${MAX_IMAGES} photos.`);
          continue;
        }
        const file = await shrinkPhoto(original);
        if (file.size > MAX_IMAGE_BYTES) problems.push(`${original.name}: must be 5 MB or smaller.`);
        else accepted.push({ key: `new-${(previewKey += 1)}`, file, url: URL.createObjectURL(file) });
      }
    } finally {
      setPreparingPhotos(false);
    }
    setImages((list) => [...list, ...accepted]);
    setErrors((e) => ({ ...e, images: [...new Set(problems)].join(' ') || undefined }));
  };

  const addImages = (event) => {
    const files = [...event.target.files];
    event.target.value = '';
    return addFiles(files);
  };

  // Phones open their own camera app (better focus and quality); laptops get a webcam preview.
  const takePhoto = () => {
    if (window.matchMedia?.('(pointer: coarse)').matches) cameraInput.current?.click();
    else setCameraOpen(true);
  };

  const addCameraPhoto = (file) => {
    setCameraOpen(false);
    addFiles([file]);
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
                <>
                  <button type="button" className="upload-add" onClick={() => fileInput.current?.click()} disabled={preparingPhotos}>
                    <Icon name="image" size={24} />
                    Add photo
                  </button>
                  <button type="button" className="upload-add" onClick={takePhoto} disabled={preparingPhotos}>
                    <Icon name="camera" size={24} />
                    Take photo
                  </button>
                </>
              )}
            </div>
            <input ref={fileInput} type="file" accept={IMAGE_TYPES.join(',')} multiple hidden onChange={addImages} />
            <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={addImages} aria-label="Take photo with camera" />
            {preparingPhotos ? (
              <p className="hint" role="status">
                Preparing photos…
              </p>
            ) : (
              <p className="hint">JPG, PNG or WebP. Large photos are made smaller automatically. The first photo is the cover.</p>
            )}
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
      {cameraOpen && <CameraDialog onCapture={addCameraPhoto} onClose={closeCamera} />}
    </div>
  );
}

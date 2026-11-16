import { useState } from 'react';
import { useAuth } from '../auth.jsx';
import { ApiError } from '../api.js';
import { Dialog, SelectField, TextAreaField } from './ui.jsx';
import { COMPLAINT_REASONS, REPORT_REASONS, submitComplaint, submitReport } from '../services/moderation.js';

/** Lets a student report an inappropriate listing or file a complaint about a deal (feeds UC-10/UC-11). */
export default function ReportDialog({ listing, onClose }) {
  const { user } = useAuth();
  const [kind, setKind] = useState('report');
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [status, setStatus] = useState('idle');

  const submit = async (event) => {
    event.preventDefault();
    setErrors({});
    setFormError(null);
    setStatus('sending');
    try {
      if (kind === 'report') await submitReport(user, { listingId: listing.id, reason, description });
      else await submitComplaint(user, { listingId: listing.id, reason });
      setStatus('sent');
    } catch (err) {
      const e = err instanceof ApiError ? err : new ApiError(0, 'Something went wrong.');
      setErrors(e.fieldErrors);
      if (!Object.keys(e.fieldErrors).length) setFormError(e.message);
      setStatus('idle');
    }
  };

  if (status === 'sent') {
    return (
      <Dialog title="Thank you" onClose={onClose}>
        <p>An administrator will review it. We may remove the listing if it breaks the platform rules.</p>
        <button type="button" className="button" onClick={onClose}>
          Close
        </button>
      </Dialog>
    );
  }

  const reasons = kind === 'report' ? REPORT_REASONS : COMPLAINT_REASONS;
  return (
    <Dialog title="Report a problem" onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <fieldset className="field" style={{ border: 'none', padding: 0, margin: '0 0 1rem' }}>
          <legend>What is the problem?</legend>
          <div className="radio-list">
            <label>
              <input type="radio" name="kind" checked={kind === 'report'} onChange={() => { setKind('report'); setReason(''); }} />
              <span>
                <strong>This listing is inappropriate</strong>
                <br />
                <span className="muted small">Prohibited, fake, spam or offensive</span>
              </span>
            </label>
            <label>
              <input type="radio" name="kind" checked={kind === 'complaint'} onChange={() => { setKind('complaint'); setReason(''); }} />
              <span>
                <strong>I have a complaint about this deal</strong>
                <br />
                <span className="muted small">Item not as described, seller did not show up…</span>
              </span>
            </label>
          </div>
        </fieldset>
        <SelectField label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} error={errors.reason} required>
          <option value="">Choose a reason</option>
          {reasons.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </SelectField>
        {kind === 'report' && (
          <TextAreaField
            label="Details (optional)"
            value={description}
            maxLength={2000}
            onChange={(e) => setDescription(e.target.value)}
            error={errors.description}
          />
        )}
        {formError && (
          <p className="form-error" role="alert">
            {formError}
          </p>
        )}
        <div className="button-row">
          <button type="submit" className="button button-orange" disabled={status === 'sending'}>
            {status === 'sending' ? 'Sending…' : 'Submit'}
          </button>
          <button type="button" className="button button-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Dialog>
  );
}

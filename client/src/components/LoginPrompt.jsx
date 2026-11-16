import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api.js';
import { useAuth } from '../auth.jsx';
import { LoginPromptContext } from '../lib/loginPrompt.js';
import Field from './Field.jsx';
import Icon from './Icon.jsx';

const DEFAULT_REASON = 'Sign in to see item details, chat with sellers, sell your things and bid in live auctions.';

// Only return to an in-app path, never an external URL.
const safePath = (next) => (typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : null);

function LoginDialog({ reason, next, onClose }) {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const titleId = useId();
  const dialogRef = useRef(null);
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const previous = document.activeElement;
    dialogRef.current?.querySelector('input')?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      previous?.focus?.();
    };
  }, [onClose]);

  const update = (field) => (event) => setForm((f) => ({ ...f, [field]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const data = await api('/auth/sign-in', { method: 'POST', body: form });
      setUser(data.user);
      onClose();
      if (next) navigate(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="login-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={dialogRef}>
        <aside className="login-modal-side">
          <h2 id={titleId}>Login</h2>
          <p>{reason}</p>
          <ul>
            <li>
              <Icon name="shield" size={18} /> Verified university students only
            </li>
            <li>
              <Icon name="chat" size={18} /> Chat with sellers on campus
            </li>
            <li>
              <Icon name="gavel" size={18} /> Bid in live auctions
            </li>
          </ul>
          <span className="login-modal-mark" aria-hidden="true">
            <Icon name="tag" size={96} />
          </span>
        </aside>
        <div className="login-modal-main">
          <button type="button" className="login-modal-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
          <form onSubmit={submit} noValidate>
            <Field label="University email" type="email" autoComplete="email" required value={form.email} onChange={update('email')} />
            <Field label="Password" type="password" autoComplete="current-password" required value={form.password} onChange={update('password')} />
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <p className="muted small">By continuing, you agree to use CampusBazaar only for marketplace activity with fellow students.</p>
            <button type="submit" className="button button-orange button-large full" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Login'}
            </button>
          </form>
          <p className="login-modal-switch">
            <Link to="/register" onClick={onClose}>
              New to CampusBazaar? Create an account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

/** Provides openLogin() to the whole app and renders the login popup when asked. */
export default function LoginPromptProvider({ children }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState(null);

  const openLogin = useCallback(
    ({ next, reason } = {}) => {
      const target = safePath(next);
      if (user) {
        if (target) navigate(target);
        return;
      }
      setPrompt({ next: target, reason: reason ?? DEFAULT_REASON });
    },
    [user, navigate],
  );
  const close = useCallback(() => setPrompt(null), []);
  const value = useMemo(() => ({ openLogin }), [openLogin]);

  return (
    <LoginPromptContext.Provider value={value}>
      {children}
      {prompt && <LoginDialog reason={prompt.reason} next={prompt.next} onClose={close} />}
    </LoginPromptContext.Provider>
  );
}

import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api.js';
import { useAuth } from '../auth.jsx';
import Field from '../components/Field.jsx';

export default function SignIn() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Only return to an in-app path, never an external URL.
  const from = typeof location.state?.from === 'string' && location.state.from.startsWith('/') ? location.state.from : '/profile';

  if (user) return <Navigate to={from} replace />;

  const update = (field) => (event) => setForm((f) => ({ ...f, [field]: event.target.value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const data = await api('/auth/sign-in', { method: 'POST', body: form });
      setUser(data.user);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <section className="card narrow">
      <h1>Sign in</h1>
      <form onSubmit={handleSubmit} noValidate>
        <Field label="University email" type="email" autoComplete="email" required value={form.email} onChange={update('email')} />
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={form.password}
          onChange={update('password')}
        />
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="button full" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="muted center">
        New to CampusBazaar? <Link to="/register">Register</Link>
      </p>
    </section>
  );
}

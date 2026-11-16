import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api.js';
import { useAuth } from '../auth.jsx';
import Field from '../components/Field.jsx';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', password: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const update = (field) => (event) => setForm((f) => ({ ...f, [field]: event.target.value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    setErrors({});
    setFormError(null);
    if (form.password !== form.confirmPassword) {
      setErrors({ confirmPassword: 'Passwords do not match.' });
      return;
    }
    setSubmitting(true);
    try {
      const data = await api('/auth/complete-registration', {
        method: 'POST',
        body: { token, name: form.name, password: form.password },
      });
      setUser(data.user);
      navigate('/profile', { replace: true });
    } catch (err) {
      const apiError = err instanceof ApiError ? err : new ApiError(0, 'Something went wrong. Please try again.');
      const { token: tokenError, ...fieldErrors } = apiError.fieldErrors;
      setErrors(fieldErrors);
      if (tokenError) {
        setFormError({ message: 'This verification link is invalid or has expired.', linkInvalid: true });
      } else if (Object.keys(fieldErrors).length === 0) {
        // 400 without field errors = invalid/expired link; 409 = account already exists.
        setFormError({ message: apiError.message, linkInvalid: apiError.status === 400, accountExists: apiError.status === 409 });
      }
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <section className="card narrow">
        <h1>Verification link missing</h1>
        <p>Open the full link from your verification email, or <Link to="/register">request a new one</Link>.</p>
      </section>
    );
  }

  return (
    <section className="card narrow">
      <h1>Finish creating your account</h1>
      <p className="muted">Your university email is being verified. Choose your name and password.</p>
      <form onSubmit={handleSubmit} noValidate>
        <Field label="Full name" autoComplete="name" required value={form.name} onChange={update('name')} error={errors.name} />
        <Field
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          value={form.password}
          onChange={update('password')}
          error={errors.password}
          hint="At least 8 characters."
        />
        <Field
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          required
          value={form.confirmPassword}
          onChange={update('confirmPassword')}
          error={errors.confirmPassword}
        />
        {formError && (
          <p className="form-error" role="alert">
            {formError.message} {formError.linkInvalid && <Link to="/register">Request a new link</Link>}
            {formError.accountExists && <Link to="/sign-in">Sign in</Link>}
          </p>
        )}
        <button type="submit" className="button button-orange full" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>
    </section>
  );
}

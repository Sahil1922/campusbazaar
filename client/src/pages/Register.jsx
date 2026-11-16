import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api.js';
import Field from '../components/Field.jsx';

export default function Register() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle | sending | sent
  const [error, setError] = useState(null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setStatus('sending');
    try {
      await api('/auth/register', { method: 'POST', body: { email } });
      setStatus('sent');
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, 'Something went wrong. Please try again.'));
      setStatus('idle');
    }
  };

  if (status === 'sent') {
    return (
      <section className="card narrow">
        <h1>Check your inbox</h1>
        <p>
          If <strong>{email.trim().toLowerCase()}</strong> can be registered, we have sent it a verification link. Open
          the link to finish creating your account. It expires in 24 hours.
        </p>
        <p className="muted">
          No email after a few minutes? Check your spam folder, then{' '}
          <button type="button" className="link-button" onClick={() => setStatus('idle')}>
            try again
          </button>
          .
        </p>
      </section>
    );
  }

  return (
    <section className="card narrow">
      <h1>Create your account</h1>
      <p className="muted">CampusBazaar is only for students. Use your university email address.</p>
      <form onSubmit={handleSubmit} noValidate>
        <Field
          label="University email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={error?.fieldErrors.email}
        />
        {error && !error.fieldErrors.email && (
          <p className="form-error" role="alert">
            {error.message}
          </p>
        )}
        <button type="submit" className="button button-orange full" disabled={status === 'sending'}>
          {status === 'sending' ? 'Sending…' : 'Send verification link'}
        </button>
      </form>
      <p className="muted center">
        Already registered? <Link to="/sign-in">Sign in</Link>
      </p>
    </section>
  );
}

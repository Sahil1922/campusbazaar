import { Navigate, useLocation } from 'react-router-dom';
import { hasRole, useAuth } from '../auth.jsx';

/**
 * Hides pages from signed-out users or users without a role. This is only for a better
 * experience: the server enforces the same rules on every API request.
 */
export default function RequireAuth({ role, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <p className="muted">Loading…</p>;
  if (!user) return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />;
  if (role && !hasRole(user, role)) {
    return (
      <section className="card">
        <h1>Not allowed</h1>
        <p>You do not have permission to view this page.</p>
      </section>
    );
  }
  return children;
}

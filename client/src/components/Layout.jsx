import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { hasRole, useAuth } from '../auth.jsx';

export default function Layout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/sign-in');
  };

  return (
    <div className="app">
      <header className="site-header">
        <div className="container header-inner">
          <Link to="/" className="brand">
            CampusBazaar
          </Link>
          <nav className="nav" aria-label="Main">
            {user ? (
              <>
                <NavLink to="/profile">Profile</NavLink>
                {hasRole(user, 'admin') && <NavLink to="/admin/users">Manage users</NavLink>}
                <button type="button" className="link-button" onClick={handleSignOut}>
                  Sign out
                </button>
              </>
            ) : (
              <>
                <NavLink to="/sign-in">Sign in</NavLink>
                <NavLink to="/register" className="button button-small">
                  Register
                </NavLink>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="container main">
        <Outlet />
      </main>
    </div>
  );
}

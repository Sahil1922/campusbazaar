import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export default function Home() {
  const { user } = useAuth();
  return (
    <section className="hero">
      <h1>Buy, sell and auction with students at your university</h1>
      <p className="lead">
        CampusBazaar brings campus buying and selling into one place — searchable listings, direct messages and live
        auctions, open only to verified university students.
      </p>
      <div className="actions">
        {user ? (
          <Link to="/profile" className="button">
            Go to your profile
          </Link>
        ) : (
          <>
            <Link to="/register" className="button">
              Register with your university email
            </Link>
            <Link to="/sign-in" className="button button-secondary">
              Sign in
            </Link>
          </>
        )}
      </div>
    </section>
  );
}

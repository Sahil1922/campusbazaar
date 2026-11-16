import { Link, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import RequireAuth from './components/RequireAuth.jsx';
import Home from './pages/Home.jsx';
import Register from './pages/Register.jsx';
import VerifyEmail from './pages/VerifyEmail.jsx';
import SignIn from './pages/SignIn.jsx';
import Profile from './pages/Profile.jsx';
import AdminUsers from './pages/AdminUsers.jsx';
import Listings from './pages/Listings.jsx';
import ListingDetail from './pages/ListingDetail.jsx';
import ListingForm from './pages/ListingForm.jsx';
import MyListings from './pages/MyListings.jsx';
import StartAuction from './pages/StartAuction.jsx';
import Auctions from './pages/Auctions.jsx';
import AuctionDetail from './pages/AuctionDetail.jsx';
import Messages from './pages/Messages.jsx';
import Notifications from './pages/Notifications.jsx';
import AdminModeration from './pages/AdminModeration.jsx';

function NotFound() {
  return (
    <section className="card narrow">
      <h1>Page not found</h1>
      <p>
        <Link to="/">Back to CampusBazaar</Link>
      </p>
    </section>
  );
}

// The marketplace is for verified students only, so every marketplace page requires sign-in.
const signedIn = (element) => <RequireAuth>{element}</RequireAuth>;
const adminOnly = (element) => <RequireAuth role="admin">{element}</RequireAuth>;

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="register" element={<Register />} />
        <Route path="verify-email" element={<VerifyEmail />} />
        <Route path="sign-in" element={<SignIn />} />
        <Route path="profile" element={signedIn(<Profile />)} />

        <Route path="listings" element={signedIn(<Listings />)} />
        <Route path="listings/:id" element={signedIn(<ListingDetail />)} />
        <Route path="listings/:id/edit" element={signedIn(<ListingForm />)} />
        <Route path="listings/:id/auction" element={signedIn(<StartAuction />)} />
        <Route path="sell" element={signedIn(<ListingForm />)} />
        <Route path="my/listings" element={signedIn(<MyListings />)} />

        <Route path="auctions" element={signedIn(<Auctions />)} />
        <Route path="auctions/:id" element={signedIn(<AuctionDetail />)} />

        <Route path="messages" element={signedIn(<Messages />)} />
        <Route path="messages/:listingId/:buyerId" element={signedIn(<Messages />)} />
        <Route path="notifications" element={signedIn(<Notifications />)} />

        <Route path="admin/users" element={adminOnly(<AdminUsers />)} />
        <Route path="admin/reports" element={adminOnly(<AdminModeration key="reports" kind="reports" />)} />
        <Route path="admin/complaints" element={adminOnly(<AdminModeration key="complaints" kind="complaints" />)} />

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

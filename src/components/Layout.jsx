import { Outlet } from 'react-router-dom';
import Header from './Header.jsx';

// <Outlet/> is where the matched child route's page appears.
export default function Layout() {
  return (
    <>
      <a href="#main" className="skip-link">Skip to main content</a>
      <Header />
      <main id="main" className="container page">
        <Outlet />
      </main>
      <footer className="site-footer">
        <div className="container">Expense Splitter V1. Payments happen outside the app.</div>
      </footer>
    </>
  );
}
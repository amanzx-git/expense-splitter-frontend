import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Placeholder from './pages/Placeholder.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import DesignPreviewPage from './pages/DesignPreviewPage.jsx';
import QuickSplitPage from './pages/QuickSplitPage.jsx';

// /quick-split is NOT in this list: it has a real page below.
const routes = [
  { path: '/', title: 'Home', access: 'public' },
  { path: '/register', title: 'Register', access: 'guest' },
  { path: '/login', title: 'Sign in', access: 'guest' },
  { path: '/verify-email', title: 'Verify email', access: 'public' },
  { path: '/forgot-password', title: 'Forgot password', access: 'public' },
  { path: '/reset-password', title: 'Reset password', access: 'public' },
  { path: '/dashboard', title: 'Dashboard', access: 'verified user' },
  { path: '/groups/:groupId', title: 'Group', access: 'accepted member' },
  { path: '/groups/:groupId/members', title: 'Group members', access: 'accepted member' },
  { path: '/groups/:groupId/settlements/:settlementId', title: 'Settlement', access: 'accepted member' },
  { path: '/invitations', title: 'Invitations', access: 'verified user' },
  { path: '/profile', title: 'Profile', access: 'signed in' },
];

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        {routes.map((r) => (
          <Route key={r.path} path={r.path} element={<Placeholder title={r.title} access={r.access} />} />
        ))}
        <Route path="/quick-split" element={<QuickSplitPage />} />
        <Route path="/design-preview" element={<DesignPreviewPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
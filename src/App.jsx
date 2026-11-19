import { Route, Routes } from 'react-router-dom';
import MessagesPage from './pages/MessagesPage.jsx';
import DirectChatPage from './pages/DirectChatPage.jsx';
import Layout from './components/Layout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import GuestRoute from './components/GuestRoute.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import DesignPreviewPage from './pages/DesignPreviewPage.jsx';
import HomePage from './pages/HomePage.jsx';
import QuickSplitPage from './pages/QuickSplitPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import VerifyEmailPage from './pages/VerifyEmailPage.jsx';
import ForgotPasswordPage from './pages/ForgotPasswordPage.jsx';
import ResetPasswordPage from './pages/ResetPasswordPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import GroupPage from './pages/GroupPage.jsx';
import GroupHistoryPage from './pages/GroupHistoryPage.jsx';
import GroupSettingsPage from './pages/GroupSettingsPage.jsx';
import GroupMembersPage from './pages/GroupMembersPage.jsx';
import InvitationsPage from './pages/InvitationsPage.jsx';
import SettlementPage from './pages/SettlementPage.jsx';
import NotificationsPage from './pages/NotificationsPage.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        {/* public: these never wait for the backend */}
        <Route path="/" element={<HomePage />} />
        <Route path="/quick-split" element={<QuickSplitPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* guests only */}
        <Route element={<GuestRoute />}>
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/login" element={<LoginPage />} />
        </Route>

        {/* signed in + verified */}
        <Route element={<ProtectedRoute />}>
          <Route path="/messages" element={<MessagesPage />} />
          <Route path="/messages/new/:recipientId" element={<DirectChatPage />} />
          <Route path="/messages/:conversationId" element={<DirectChatPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/groups/:groupId" element={<GroupPage />} />
          <Route path="/groups/:groupId/history" element={<GroupHistoryPage />} />
          <Route path="/groups/:groupId/settings" element={<GroupSettingsPage />} />
          <Route path="/groups/:groupId/members" element={<GroupMembersPage />} />
          <Route path="/groups/:groupId/settlements/:settlementId" element={<SettlementPage />} />
          <Route path="/invitations" element={<InvitationsPage />} />
        </Route>

        {/* signed in */}
        <Route element={<ProtectedRoute requireVerified={false} />}>
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Route>

        <Route path="/design-preview" element={<DesignPreviewPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

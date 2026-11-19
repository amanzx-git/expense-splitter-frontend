import { Outlet, useMatch } from 'react-router-dom';
import PaymentActionsProvider from '../features/settlements/PaymentActionsProvider.jsx';
import MessagesProvider from '../features/messaging/MessagesProvider.jsx';
import Header from './Header.jsx';
import NotificationsProvider from '../features/notifications/NotificationsProvider.jsx';
import Logo from './Logo.jsx';
import { USE_MOCKS } from '../api/client.js';

export default function Layout() {
  const group = useMatch('/groups/:groupId');
  const chat = useMatch('/messages/:conversationId');
  const newChat = useMatch('/messages/new/:recipientId');
  const conversation = group || chat || newChat;
  return (
    <NotificationsProvider><MessagesProvider><PaymentActionsProvider>
      <div className={conversation ? 'app-shell app-shell--conversation' : 'app-shell'}>
      <a href="#main" className="skip-link">Skip to main content</a>
      {USE_MOCKS && (
        <div className="mock-banner" role="note">
          Demo mode. Changes are temporary.
        </div>
      )}
      <Header />
      <main id="main" className="container page">
        <Outlet />
      </main>
      <footer className="site-footer">
        <div className="container footer-row">
          <Logo variant="icon" decorative className="logo--footer" />
          <span>Payments happen outside Splitter.</span>
        </div>
      </footer>
      </div>
    </PaymentActionsProvider></MessagesProvider></NotificationsProvider>
  );
}

import { createContext, useContext, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import { getUnreadCount } from '../../api/notifications.js';
import { useGroupResource } from '../groups/resources.jsx';

const NotificationContext = createContext(null);
export const useNotifications = () => useContext(NotificationContext);

function NotificationSession({ userId, children }) {
  const { pathname } = useLocation();
  const [revision, setRevision] = useState(0);
  const count = useGroupResource(async (signal) => userId ? getUnreadCount(signal) : { unread_count: 0 }, [userId, pathname, revision]);
  useEffect(() => {
    if (!userId) return;
    const refresh = () => setRevision((v) => v + 1);
    let lastActiveRefresh = 0;
    const refreshActive = () => {
      if (document.visibilityState === 'hidden' || Date.now() - lastActiveRefresh < 5000) return;
      lastActiveRefresh = Date.now();
      setRevision((value) => value + 1);
    };
    const timer = window.setInterval(refreshActive, 60000);
    window.addEventListener('splitter:notifications-changed', refresh);
    window.addEventListener('focus', refreshActive);
    document.addEventListener('visibilitychange', refreshActive);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('splitter:notifications-changed', refresh);
      window.removeEventListener('focus', refreshActive);
      document.removeEventListener('visibilitychange', refreshActive);
    };
  }, [userId]);
  return <NotificationContext.Provider value={{ count, revision, refresh: () => setRevision((v) => v + 1) }}>{children}</NotificationContext.Provider>;
}

export default function NotificationsProvider({ children }) {
  const { user, status } = useAuth();
  const id = status === 'authenticated' ? user?.id : null;
  // Remount and abort recipient-specific reads immediately when the session changes.
  return <NotificationSession key={id ?? 'anonymous'} userId={id}>{children}</NotificationSession>;
}

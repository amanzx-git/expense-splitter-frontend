import { createContext, useContext, useEffect, useState } from 'react';
import { useLocation, NavLink } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import { useGroupResource } from '../groups/resources.jsx';
import { getMessageCount } from '../../api/messages.js';
const MessagesContext = createContext(null);
export const useMessages = () => useContext(MessagesContext);

function Session({ userId, children }) {
  const { pathname } = useLocation();
  const [revision, setRevision] = useState(0);
  const count = useGroupResource((signal) => userId ? getMessageCount(signal) : Promise.resolve({ unread_count: 0 }), [userId, pathname, revision]);
  useEffect(() => {
    if (!userId) return;
    let lastFocus = 0;
    const update = () => setRevision((value) => value + 1);
    const focus = () => {
      if (document.visibilityState === 'hidden' || Date.now() - lastFocus < 3000) return;
      lastFocus = Date.now(); update();
    };
    window.addEventListener('splitter:messages-changed', update);
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', focus);
    return () => {
      window.removeEventListener('splitter:messages-changed', update);
      window.removeEventListener('focus', focus);
      document.removeEventListener('visibilitychange', focus);
    };
  }, [userId]);
  return <MessagesContext.Provider value={{ count, revision }}>{children}</MessagesContext.Provider>;
}
export default function MessagesProvider({ children }) {
  const { user, status } = useAuth();
  const userId = status === 'authenticated' && user?.email_verified !== false ? user?.id : null;
  return <Session key={userId ?? 'guest'} userId={userId}>{children}</Session>;
}
export function MessagesNavLink({ onNavigate }) {
  const context = useMessages();
  const count = context?.count.data?.unread_count ?? 0;
  return <NavLink to="/messages" onClick={onNavigate} aria-label={`Messages${count ? `, ${count} unread` : ''}`}><span>Messages</span>{count > 0 && <span className="notification-badge" aria-hidden="true">{count > 99 ? '99+' : count}</span>}{context?.count.error && <span className="visually-hidden">Unread count unavailable</span>}</NavLink>;
}

import { NavLink } from 'react-router-dom';
import { useNotifications } from './NotificationsProvider.jsx';
import Button from '../../components/Button.jsx';
import Icon from '../../components/Icon.jsx';

export default function NotificationBell({ onNavigate }) {
  const { count } = useNotifications();
  return <div className="notification-bell row">
    <NavLink to="/notifications" onClick={onNavigate} aria-label={`Notifications${count.data ? `, ${count.data.unread_count} unread` : ''}`}>
      <Icon name="bell" /> <span className="notification-label">Notifications</span> {count.data?.unread_count > 0 && <span className="notification-badge" aria-hidden="true">{count.data.unread_count > 9 ? '9+' : count.data.unread_count}</span>}
    </NavLink>
    {count.loading && <span role="status" className="visually-hidden">Loading unread count</span>}
    {count.error && <div role="alert" className="notification-count-error"><span>{count.error.message}</span> <Button variant="secondary" onClick={count.refresh}>Retry unread count</Button></div>}
  </div>;
}

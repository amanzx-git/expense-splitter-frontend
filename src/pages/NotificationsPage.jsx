import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listNotifications, markNotificationRead } from '../api/notifications.js';
import { useNotifications } from '../features/notifications/NotificationsProvider.jsx';
import { notificationTarget, notificationTitle, notificationPresentation, isAssignedExpenseNotice } from '../features/notifications/navigation.js';
import { useGroupResource, ResourceState, Pagination } from '../features/groups/resources.jsx';
import { describeError } from '../utils/apiErrors.js';
import Button from '../components/Button.jsx';
import EmptyState from '../components/EmptyState.jsx';
import FormAlert from '../components/FormAlert.jsx';
import Money from '../components/Money.jsx';
import Icon from '../components/Icon.jsx';

function NotificationContent({ note }) {
  const content = notificationPresentation(note);
  return <span className="notification-card-body">
    {content.amount ? <strong className="notification-card-amount"><Money value={content.amount} /></strong> : content.text && <span className="notification-card-action">{content.text}</span>}
    {content.actor && <span className="notification-card-context"><Icon name="people" />By {content.actor}</span>}
    {content.group && <span className="notification-card-context"><Icon name="discussion" />{content.group}</span>}
  </span>;
}

export default function NotificationsPage() {
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const notifications = useNotifications();
  const list = useGroupResource((signal) => listNotifications(page, signal), [page, notifications.revision]);
  const navigate = useNavigate();
  const action = useRef(null);
  useEffect(() => () => action.current?.abort(), []);
  async function act(note, open) {
    if (action.current) return;
    const controller = new AbortController(); action.current = controller;
    setBusy(note.id); setError(null);
    try {
      let target;
      if (open) target = await notificationTarget(note, controller.signal);
      if (!note.is_read) {
        await markNotificationRead(note.id, controller.signal);
        if (!controller.signal.aborted) notifications.refresh();
      }
      if (open && !controller.signal.aborted) navigate(target);
    } catch (err) { if (!controller.signal.aborted) setError(describeError(err)); }
    finally { if (!controller.signal.aborted) { action.current = null; setBusy(null); } }
  }
  return <div className="stack">
    <h1>Notifications</h1>
    <FormAlert message={error?.message} items={error?.other} hint={error?.hint} />
    <ResourceState resource={list}>
      {list.data?.results.length === 0 && <EmptyState title="No notifications yet" />}
      <ul className="plain-list notification-cards">{list.data?.results.map((note) => <li className={`notification-card${note.is_read ? '' : ' notification-unread'}${note.action_required === true ? ' notification-action-needed' : ''}${!note.is_read && isAssignedExpenseNotice(note) ? ' notification-expense-notice' : !note.is_read && note.type === 'expense_added' ? ' notification-expense-other' : ''}`} key={note.id}>
        <button type="button" className="notification-card-open" disabled={!!busy} aria-label="Open notification" onClick={() => act(note, true)}>
          <span className="notification-card-heading"><strong>{!note.is_read && note.type === 'expense_added' && <Icon name="receipt" />}{notificationTitle(note)}</strong><span className="notification-card-flags">{note.action_required === true && <span className="attention-label">Action needed</span>}<span className="notification-card-badge">{note.is_read ? 'Read' : 'Unread'}</span></span></span>
          <NotificationContent note={note} />
        </button>
        {!note.is_read && <div className="notification-card-footer"><Button variant="secondary" disabled={!!busy} onClick={() => act(note, false)}>Mark as read</Button></div>}
      </li>)}</ul>
      <Pagination data={list.data} page={page} onPage={setPage} />
    </ResourceState>
  </div>;
}

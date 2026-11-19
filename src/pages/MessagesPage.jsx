import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getConversations } from '../api/messages.js';
import { useGroupResource, ResourceState, Pagination } from '../features/groups/resources.jsx';
import { useMessages } from '../features/messaging/MessagesProvider.jsx';
import UserAvatar from '../components/UserAvatar.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { personName } from '../features/settlements/paymentPresentation.jsx';

export default function MessagesPage() {
  const [page, setPage] = useState(1);
  const messages = useMessages();
  const resource = useGroupResource((signal) => getConversations(page, signal), [page, messages?.revision]);
  return <div className="stack"><h1>Messages</h1><ResourceState resource={resource}>
    {resource.data?.results.length === 0 && <EmptyState title="No messages yet." description="Open a group member's profile to start a conversation." />}
    <ul className="plain-list direct-inbox">{resource.data?.results.map((conversation) => <li key={conversation.id}><Link className="card direct-inbox-row" to={`/messages/${conversation.id}`}>
      <UserAvatar user={conversation.recipient} decorative />
      <span className="direct-inbox-copy"><strong>{personName(conversation.recipient)}</strong><span>{conversation.last_message?.body || 'No messages yet'}</span></span>
      <span className="direct-inbox-meta"><time dateTime={conversation.updated_at}>{new Date(conversation.updated_at).toLocaleString()}</time>{conversation.unread_count > 0 && <span className="notification-badge" aria-label={`${conversation.unread_count} unread messages`}>{conversation.unread_count}</span>}</span>
    </Link></li>)}</ul>
    <Pagination data={resource.data} page={page} onPage={setPage} />
  </ResourceState></div>;
}

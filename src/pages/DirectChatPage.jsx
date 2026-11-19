import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import * as api from '../api/messages.js';
import { describeActionError, describeError } from '../utils/apiErrors.js';
import UserAvatar from '../components/UserAvatar.jsx';
import MemberIdentity from '../features/groups/MemberIdentity.jsx';
import { personName } from '../features/settlements/paymentPresentation.jsx';
import Button from '../components/Button.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import FormAlert from '../components/FormAlert.jsx';
import LoadingState from '../components/LoadingState.jsx';

const merge = (current, incoming) => [...new Map([...current, ...incoming].map((item) => [item.id, item])).values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
export default function DirectChatPage() {
  const { conversationId, recipientId } = useParams();
  const { user } = useAuth();
  return <Chat key={`${user?.id}:${conversationId || recipientId}`} conversationId={conversationId} recipientId={recipientId} userId={user?.id} />;
}
function Chat({ conversationId, recipientId, userId }) {
  const location = useLocation(), navigate = useNavigate();
  const [info, setInfo] = useState(null), [messages, setMessages] = useState([]);
  const [text, setText] = useState(location.state?.draft || ''), [error, setError] = useState(null), [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true), [sending, setSending] = useState(false), [olderBusy, setOlderBusy] = useState(false);
  const [cursor, setCursor] = useState(null), [retry, setRetry] = useState(0), [blocked, setBlocked] = useState(false);
  const feed = useRef(null), nearBottom = useRef(true), prepend = useRef(null), input = useRef(null);
  const pending = useRef(location.state?.pending || null), sendingRef = useRef(false), draft = useRef(text), olderLoaded = useRef(false);
  useEffect(() => { draft.current = text; }, [text]);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const controller = new AbortController();
    let running = false;
    async function refresh() {
      if (running || controller.signal.aborted || document.visibilityState === 'hidden') return;
      running = true;
      try {
        if (!conversationId) {
          const data = await api.getRecipient(recipientId, controller.signal);
          if (controller.signal.aborted) return;
          if (data.conversation) { navigate(`/messages/${data.conversation.id}`, { replace: true, state: { draft: draft.current, pending: pending.current } }); return; }
          setInfo(data); setBlocked(false); setLoadError('');
        } else {
          const [detail, page] = await Promise.all([api.getConversation(conversationId, controller.signal), api.getMessages(conversationId, null, controller.signal)]);
          if (controller.signal.aborted) return;
          setInfo(detail.conversation); setBlocked(false); setMessages((current) => merge(current, page.results)); setLoadError('');
          if (!olderLoaded.current) setCursor(api.messageCursor(page.next));
          if (detail.conversation.unread_count > 0 && page.results[0] && document.visibilityState !== 'hidden') {
            const result = await api.markConversationRead(conversationId, page.results[0].id);
            if (!controller.signal.aborted) setMessages((current) => current.map((item) => item.sender_id !== userId && !item.read_at && item.created_at <= page.results[0].created_at ? { ...item, read_at: result.read_at } : item));
          }
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setLoadError(describeError(err).message);
          if ([403, 404].includes(err.status)) setBlocked(true);
        }
      } finally { if (!controller.signal.aborted) { running = false; setLoading(false); } }
    }
    refresh();
    const timer = conversationId ? window.setInterval(refresh, 12000) : null;
    window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', refresh);
    return () => { controller.abort(); window.clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [conversationId, recipientId, userId, retry, navigate]);
  useLayoutEffect(() => {
    const node = feed.current;
    if (!node) return;
    if (prepend.current) { node.scrollTop = prepend.current.top + node.scrollHeight - prepend.current.height; prepend.current = null; }
    else if (nearBottom.current) node.scrollTop = node.scrollHeight;
  }, [messages]);
  async function older() {
    if (!cursor || olderBusy) return;
    setOlderBusy(true); setLoadError('');
    try {
      const page = await api.getMessages(conversationId, cursor);
      if (!mounted.current) return;
      if (feed.current) prepend.current = { top: feed.current.scrollTop, height: feed.current.scrollHeight };
      olderLoaded.current = true; setCursor(api.messageCursor(page.next)); setMessages((current) => merge(current, page.results));
    } catch (err) { setLoadError(describeError(err).message); }
    finally { setOlderBusy(false); }
  }
  async function send(event) {
    event?.preventDefault();
    const body = text.trim();
    if (sendingRef.current || !body || body.length > 2000 || !info?.can_send || blocked) return;
    if (!pending.current || pending.current.body !== body) pending.current = { body, key: crypto.randomUUID() };
    sendingRef.current = true; setSending(true); setError(null);
    try {
      const result = conversationId ? await api.sendMessage(conversationId, body, pending.current.key) : await api.startConversation(recipientId, body, pending.current.key);
      if (!mounted.current) return;
      pending.current = null; setText(''); nearBottom.current = true;
      if (!conversationId) navigate(`/messages/${result.conversation.id}`, { replace: true });
      else { setMessages((current) => merge(current, [result.message])); requestAnimationFrame(() => input.current?.focus()); }
    } catch (err) {
      setError(describeActionError(err, 'send your message', ['body']));
      if ([403, 404].includes(err.status)) setBlocked(true);
    } finally { sendingRef.current = false; setSending(false); }
  }
  if (loading) return <LoadingState label="Loading conversation..." />;
  if (!info) return <div className="stack"><Link to="/messages">Back to messages</Link><ErrorMessage message={loadError || 'Conversation not found.'} onRetry={() => setRetry((value) => value + 1)} /></div>;
  const recipient = info.recipient;
  return <section className="direct-chat" aria-label={`Conversation with ${personName(recipient)}`}>
    <header className="direct-chat-heading"><Link className="btn btn-secondary" to="/messages" aria-label="Back to messages">Back</Link>
      <UserAvatar user={recipient} decorative /><div><h1>{personName(recipient)}</h1>{info.profile_group_id && <MemberIdentity groupId={info.profile_group_id} user={recipient}><span>View profile</span></MemberIdentity>}</div>
    </header>
    {loadError && <ErrorMessage message={loadError} onRetry={() => setRetry((value) => value + 1)} />}
    <div className="direct-chat-feed" ref={feed} tabIndex={0} aria-label="Message history" onScroll={() => { const node = feed.current; nearBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80; }}>
      {cursor && <Button variant="secondary" loading={olderBusy} onClick={older}>Older messages</Button>}
      {!messages.length && <p className="muted">No messages yet. Say hello.</p>}
      <ol className="plain-list direct-message-list">{messages.map((item) => <li key={item.id} className={`direct-message ${item.sender_id === userId ? 'direct-message--own' : ''}`}>
        <p>{item.body}</p><small><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString()}</time>{item.sender_id === userId && <span> &#183; {item.read_at ? 'Read' : 'Sent'}</span>}</small>
      </li>)}</ol>
    </div>
    <div className="direct-chat-compose"><FormAlert message={error?.message} items={error?.other} hint={error?.hint} />
      {info.can_send && !blocked ? <form onSubmit={send}><label htmlFor="direct-message">Message</label>
        <textarea id="direct-message" ref={input} value={text} maxLength={2000} rows={2} disabled={sending} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); } }} />
        <Button type="submit" loading={sending} disabled={!text.trim() || text.trim().length > 2000}>{sending ? 'Sending...' : 'Send'}</Button>
      </form> : <><p className="muted">You can send messages only while you share a group. Your conversation history is still available.</p>{text && <div><label htmlFor="unsent-direct-message">Unsent message</label><textarea id="unsent-direct-message" readOnly value={text} rows={2} /></div>}</>}
    </div>
  </section>;
}

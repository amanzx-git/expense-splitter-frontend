import { useId, useState } from 'react';
import * as api from '../../api/expenses.js';
import { useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import MemberIdentity from '../groups/MemberIdentity.jsx';
import MentionComposer from '../groups/MentionComposer.jsx';
import { trimMentionInput } from '../groups/mentionText.js';
import { useGroupResource, ResourceState, Pagination } from '../groups/resources.jsx';
import { describeActionError } from '../../utils/apiErrors.js';
import Button from '../../components/Button.jsx';
import Input from '../../components/Input.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import FormAlert from '../../components/FormAlert.jsx';
import UserAvatar from '../../components/UserAvatar.jsx';

export default function Comments({ groupId, expenseId, onUnavailable, onBusy }) {
  const [page, setPage] = useState(1);
  const [text, setText] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [mentions, setMentions] = useState([]);
  const request = useRef(null), sending = useRef(false);
  const [params, setParams] = useSearchParams();
  const focusedId = !expenseId ? params.get('comment') : null;
  const list = useGroupResource((signal) => api.getComments(groupId, expenseId, page, signal, focusedId), [groupId, expenseId, page, focusedId]);
  useEffect(() => { if (focusedId && list.data) { const node = document.getElementById('comment-'+focusedId); node?.scrollIntoView?.({ block: 'center' }); node?.focus(); } }, [focusedId, list.data]);
  const heading = expenseId ? 'Expense comments' : 'Group comments';
  const label = useId();
  async function submit(event) {
    event.preventDefault();
    if (busy || sending.current) return;
    if (!text.trim() || text.trim().length > 1000) { setError({ fieldErrors: { text: 'Enter 1 to 1000 characters.' } }); return; }
    sending.current = true; setBusy(true); setError(null);
    onBusy?.(true);
    try {
      const payload = trimMentionInput(text, mentions), fingerprint = JSON.stringify(payload);
      if (!request.current || request.current.fingerprint !== fingerprint) request.current = { fingerprint, key: crypto.randomUUID() };
      await api.postComment(groupId, expenseId, payload.text, expenseId ? {} : { mentions: payload.mentions, client_request_id: request.current.key });
      request.current = null; setText(''); setMentions([]); setPage(1); list.refresh();
    }
    catch (err) {
      setError(describeActionError(err, 'post your comment', ['text', 'mentions', 'client_request_id']));
      if ([403, 404].includes(err.status)) { setBlocked(true); onUnavailable?.(); }
      if (err.status === 409) list.refresh();
    } finally { sending.current = false; setBusy(false); onBusy?.(false); }
  }
  return <section className="card stack" aria-labelledby={label}>
    <h3 id={label}>{heading}</h3>
    {!expenseId && <p className="muted">Chat with your group.</p>}
    {focusedId && <Button variant="secondary" onClick={() => { const next = new URLSearchParams(params); next.delete('comment'); setParams(next, { replace: true }); }}>Back to discussion</Button>}
    <ResourceState resource={list}>
      {list.data?.results.length === 0 && <EmptyState title="No comments yet" />}
      <ul className="plain-list">{list.data?.results.map((comment) => <li id={'comment-'+comment.id} tabIndex={-1} key={comment.id} className={`list-item${comment.id === focusedId ? ' comment-highlight' : ''}`}><div>
        <div className="identity"><MemberIdentity groupId={groupId} user={comment.author}><UserAvatar user={comment.author} decorative />@{comment.author.username}</MemberIdentity><time dateTime={comment.created_at}>{new Date(comment.created_at).toLocaleString()}</time></div><p className="comment-text"><CommentText comment={comment} groupId={groupId} /></p>
      </div></li>)}</ul>
      <Pagination data={list.data} page={page} onPage={setPage} />
    </ResourceState>
    <FormAlert message={error?.message} items={error?.other} hint={error?.hint} />
    {!blocked && !list.loading && !list.error && <form onSubmit={submit} className="stack" noValidate>
      {expenseId ? <Input label="Expense comment" value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} error={error?.fieldErrors?.text} /> : <MentionComposer id={label+'-input'} groupId={groupId} value={text} mentions={mentions} onChange={(value, selected) => { setText(value); setMentions(selected); }} disabled={busy} error={error?.fieldErrors?.text || error?.fieldErrors?.mentions} />}
      <Button type="submit" loading={busy}>{busy ? 'Posting comment…' : 'Post comment'}</Button>
    </form>}
  </section>;
}

function CommentText({ comment, groupId }) {
  const chars = Array.from(comment.text), nodes = []; let offset = 0;
  for (const mention of comment.mentions || []) {
    if (mention.start < offset || mention.end > chars.length || mention.end <= mention.start) continue;
    nodes.push(chars.slice(offset, mention.start).join(''));
    nodes.push(<MemberIdentity key={mention.start} groupId={groupId} user={{ id: mention.user_id, username: mention.username_snapshot, is_deleted: mention.is_deleted }}><span className="mention-token">{chars.slice(mention.start, mention.end).join('')}</span></MemberIdentity>);
    offset = mention.end;
  }
  nodes.push(chars.slice(offset).join('')); return nodes;
}

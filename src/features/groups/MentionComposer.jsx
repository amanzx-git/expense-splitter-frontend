import { useRef, useState } from 'react';
import { getAllMembers } from '../../api/expenses.js';
import { useGroupResource, ResourceState } from './resources.jsx';
import UserAvatar from '../../components/UserAvatar.jsx';
import { editMentions } from './mentionText.js';

export default function MentionComposer({ groupId, id, value, mentions, onChange, disabled, error }) {
  const input = useRef(null);
  const [query, setQuery] = useState(null), [active, setActive] = useState(0);
  const members = useGroupResource((signal) => query === null ? Promise.resolve(null) : getAllMembers(groupId, signal), [groupId, query === null]);
  const suggestions = (members.data || []).filter((m) => `${m.user.username} ${m.user.full_name}`.toLowerCase().includes(query?.tag || '')).slice(0, 10);
  function locate(text, caret) {
    const prefix = text.slice(0, caret), match = /(?:^|\s)@([a-zA-Z0-9_]*)$/.exec(prefix);
    setQuery(match ? { start: prefix.length - match[1].length - 1, end: caret, tag: match[1].toLowerCase() } : null); setActive(0);
  }
  function select(person) {
    if (!query) return;
    const token = '@'+person.username, next = value.slice(0, query.start)+token+' '+value.slice(query.end);
    const start = Array.from(value.slice(0, query.start)).length;
    const retained = editMentions(value, next, mentions);
    onChange(next, [...retained, { user_id: person.id, start, end: start + token.length }].sort((a, b) => a.start - b.start));
    setQuery(null); input.current?.focus();
    requestAnimationFrame(() => input.current?.setSelectionRange(query.start + token.length + 1, query.start + token.length + 1));
  }
  return <div className="field mention-composer"><label htmlFor={id}>Group comment</label>
    <input ref={input} id={id} value={value} disabled={disabled} maxLength={1000} role="combobox" aria-autocomplete="list" aria-haspopup="listbox" aria-expanded={query !== null} aria-controls={query !== null ? id+'-suggestions' : undefined} aria-activedescendant={query !== null && suggestions[active] ? `${id}-mention-${active}` : undefined} aria-invalid={!!error} aria-describedby={error ? id+'-error' : undefined}
      onChange={(event) => { onChange(event.target.value, editMentions(value, event.target.value, mentions)); if (!event.nativeEvent.isComposing) locate(event.target.value, event.target.selectionStart); }} onClick={(event) => locate(value, event.currentTarget.selectionStart)}
      onKeyDown={(event) => { if (event.nativeEvent.isComposing) return; if (query !== null) { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setQuery(null); } else if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); setActive((index) => (index + (event.key === 'ArrowDown' ? 1 : -1) + suggestions.length) % (suggestions.length || 1)); } else if (event.key === 'Enter') { event.preventDefault(); if (suggestions[active]) select(suggestions[active].user); } else if (event.key === 'Tab') setQuery(null); } }} onBlur={() => setQuery(null)} />
    {error && <span id={id+'-error'} className="field-error">{error}</span>}
    {query !== null && <div className="mention-suggestions" onMouseDown={(event) => event.preventDefault()}><ResourceState resource={members}><div id={id+'-suggestions'} role="listbox" aria-label="Mention group member">{!suggestions.length && <p>No matching members</p>}{suggestions.map((member, index) => <div role="option" id={`${id}-mention-${index}`} aria-selected={index === active} key={member.user.id} onPointerDown={(event) => { event.preventDefault(); select(member.user); }}><UserAvatar user={member.user} decorative /><span>{member.user.full_name} <small>@{member.user.username}</small></span></div>)}</div></ResourceState></div>}
  </div>;
}

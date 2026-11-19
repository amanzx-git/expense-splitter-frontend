import { Link } from 'react-router-dom';
import { useContext, useState, useRef } from 'react';
import { AuthContext } from '../../context/AuthContext.jsx';
import { createPortal } from 'react-dom';
import { api } from '../../api/client.js';
import Modal from '../../components/Modal.jsx';
import UserAvatar from '../../components/UserAvatar.jsx';
import { useGroupResource, ResourceState } from './resources.jsx';

function Profile({ groupId, userId, onMessage }) {
  const auth = useContext(AuthContext);
  const resource = useGroupResource((signal) => api.get(`/groups/${groupId}/members/${userId}/profile/`, { signal }), [groupId, userId]);
  const profile = resource.data;
  const canMessage = auth?.user?.id && profile?.user?.id !== auth.user.id && !profile?.user?.is_deleted;
  return <ResourceState resource={resource}>{profile && <div className="member-profile stack">
    <UserAvatar user={profile.user} size="lg" />
    <h3>{profile.user.full_name || profile.user.username}</h3>
    <p>@{profile.user.username}</p>
    <p>{profile.membership.role === 'admin' ? 'Admin' : 'Member'} · {profile.membership.group_name}</p>
    {canMessage && <Link className="btn btn-primary member-profile-message" to={`/messages/new/${profile.user.id}`} onClick={(event) => { event.stopPropagation(); onMessage(); }}>Message</Link>}
  </div>}</ResourceState>;
}

export default function MemberIdentity(props) {
  const auth = useContext(AuthContext);
  return <Identity key={`${auth?.user?.id}:${props.groupId}:${props.user?.id}`} {...props} />;
}

function Identity({ groupId, user, children }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef(null);
  const auth = useContext(AuthContext);
  if (user?.is_deleted) return <span>Deleted member</span>;
  if (!user?.id) return <span>{children || user?.username || 'Member'}</span>;
  return <><button ref={trigger} type="button" className="member-identity" onClick={(event) => { event.stopPropagation(); setOpen(true); }}>{children || <><UserAvatar user={user} decorative /><span>{user.full_name || '@'+user.username}</span></>}</button>
    {open && createPortal(<div onClick={(event) => event.stopPropagation()}><Modal open title="Member profile" onClose={() => { setOpen(false); requestAnimationFrame(() => trigger.current?.focus()); }}><Profile key={`${auth?.user?.id}:${groupId}:${user.id}`} groupId={groupId} userId={user.id} onMessage={() => setOpen(false)} /></Modal></div>, document.body)}</>;
}

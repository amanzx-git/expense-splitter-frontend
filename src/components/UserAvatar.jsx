import { useContext, useState } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';
import { safeProfilePhotoUrl } from '../utils/profile.js';

export function userInitials(user) {
  if (user?.is_deleted) return '?';
  const name = (user?.full_name || user?.username || '').trim();
  const words = name.split(/\s+/).filter(Boolean);
  return words.length ? (Array.from(words[0])[0] + (words.length > 1 ? Array.from(words.at(-1))[0] : '')).toLocaleUpperCase() : '?';
}

function AvatarImage({ url, name, initials, pixels, decorative }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  return <span className="user-avatar" style={{ width: pixels, height: pixels }} role={decorative ? undefined : 'img'} aria-label={decorative ? undefined : `${name} avatar`} aria-hidden={decorative || undefined}>
    <span aria-hidden="true">{initials}</span>
    {url && !failed && <img src={url} alt="" width={pixels} height={pixels} loading="lazy" decoding="async" referrerPolicy="no-referrer" className={loaded ? 'is-loaded' : ''} onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />}
  </span>;
}

export default function UserAvatar({ user, size = 'sm', decorative = false }) {
  const auth = useContext(AuthContext);
  const identity = user?.id && user.id === auth?.user?.id ? { ...user, ...auth.user } : user;
  const name = identity?.is_deleted ? 'Deleted member' : identity?.full_name || identity?.username || 'Unknown user';
  const url = identity?.is_deleted ? null : safeProfilePhotoUrl(identity?.profile_photo_url);
  const pixels = { sm: 32, md: 40, lg: 56 }[size] || 32;
  return <AvatarImage key={`${identity?.id || name}:${url || ''}`} url={url} name={name} initials={userInitials(identity)} pixels={pixels} decorative={decorative} />;
}

import UserAvatar from './UserAvatar.jsx';

export default function GroupAvatar({ group, size = 'md', decorative = false }) {
  // Group identities must never collide with the signed-in user's profile cache.
  return <UserAvatar user={{ id: 'group:'+group.id, full_name: group.name, profile_photo_url: group.photo_url }} size={size} decorative={decorative} />;
}

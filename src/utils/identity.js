export const userHandle = (user) => user?.is_deleted ? 'Deleted member' : user?.username ? `@${user.username}` : 'Former member';

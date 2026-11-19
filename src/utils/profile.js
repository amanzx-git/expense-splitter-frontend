export function safeProfilePhotoUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function validateProfilePhoto(file) {
  if (!file) return 'Choose a profile photo.';
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'Choose a JPG, PNG or WebP image.';
  if (file.size > 2 * 1024 * 1024) return 'Choose a photo up to 2 MB.';
  return null;
}

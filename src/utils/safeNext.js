// Only allow in-app paths like "/dashboard". Anything else becomes null.
export function safeNext(value) {
  if (typeof value !== 'string') return null;
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  if (value.includes('\\')) return null;
  if (/[\u0000-\u0020\u007f]/.test(value)) return null;
  return value;
}

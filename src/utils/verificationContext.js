const KEY = 'splitter:verification';
export function readVerification() {
  try { return JSON.parse(sessionStorage.getItem(KEY)) || {}; } catch { return {}; }
}
export function saveVerification(context) {
  // Only navigation context; never persist passwords or verification codes.
  try { sessionStorage.setItem(KEY, JSON.stringify(context)); } catch { /* Storage may be disabled. */ }
}
export function clearVerification() {
  try { sessionStorage.removeItem(KEY); } catch { /* Storage may be disabled. */ }
}

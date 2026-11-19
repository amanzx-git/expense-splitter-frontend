export const ACCOUNT_DELETED_MESSAGE = 'Your account has been deleted.';
const KEY = 'splitter:account-deleted-notice';

// A per-tab presentation notice survives the existing full-page redirect.
// Set it only after the deletion endpoint confirms success.
export function rememberAccountDeletion() {
  try { sessionStorage.setItem(KEY, ACCOUNT_DELETED_MESSAGE); } catch { /* storage may be unavailable */ }
}

export function readAccountDeletionNotice() {
  try { return sessionStorage.getItem(KEY) === ACCOUNT_DELETED_MESSAGE ? ACCOUNT_DELETED_MESSAGE : null; }
  catch { return null; }
}

export function clearAccountDeletionNotice() {
  try { sessionStorage.removeItem(KEY); } catch { /* storage may be unavailable */ }
}

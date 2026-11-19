import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as authApi from '../api/auth.js';
import { setConnectionListener, setUnauthorizedHandler } from '../api/client.js';
import { ApiError, isCancelled } from '../api/errors.js';
import { describeError } from '../utils/apiErrors.js';

export const AuthContext = createContext(null);

// What we know about the session (status) is kept apart from whether the server
// is reachable right now (unavailable):
//   status      loading        first session check still running
//               authenticated  the server confirmed who we are
//               anonymous      the server said "not signed in" (a real 401)
//               unknown        the first check failed, so we cannot tell yet
//   unavailable true while the latest request failed as an outage
// An outage NEVER changes `user` or turns authenticated into anonymous.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading');
  const [unavailable, setUnavailable] = useState(false);
  const [checking, setChecking] = useState(true);
  const [signedOutByUser, setSignedOutByUser] = useState(false);
  const inFlight = useRef(null); // AbortController of the newest session check
  const profileFlight = useRef(null);
  const currentUser = useRef(null);
  const identityVersion = useRef(0);
  const cancelSessionCheck = useCallback(() => {
    identityVersion.current += 1;
    inFlight.current?.abort();
    inFlight.current = null;
    profileFlight.current = null;
    setChecking(false);
    setStatus((value) => value === 'loading' ? 'unknown' : value);
  }, []);

  // Registered first, so no request can finish before the client can report to us.
  useEffect(() => {
    setConnectionListener((state) => setUnavailable(state === 'down'));
    setUnauthorizedHandler(() => {
      identityVersion.current += 1;
      currentUser.current = null;
      setUser(null);
      setStatus('anonymous');
    });
    return () => {
      setConnectionListener(null);
      setUnauthorizedHandler(null);
    };
  }, []);

  // Always sends a fresh GET /users/me/. Used at startup and by every Retry button, so
  // "Retry" really asks the backend again. Resolves true if the server answered at all.
  const recheck = useCallback(() => {
    if (inFlight.current && !inFlight.current.signal.aborted && profileFlight.current) return profileFlight.current;
    const controller = new AbortController();
    const version = identityVersion.current;
    inFlight.current = controller;
    setChecking(true);
    const pending = (async () => {
    let reachable = false;
    try {
      const data = await authApi.getMe(controller.signal);
      if (inFlight.current !== controller || identityVersion.current !== version) return false;
      currentUser.current = data.user;
      setUser(data.user);
      setStatus('authenticated');
      setSignedOutByUser(false);
      reachable = true;
    } catch (err) {
      if (inFlight.current !== controller || isCancelled(err)) return false;
      if (err instanceof ApiError && err.status === 401 && !err.unavailable) {
        setUser(null); // the server really says: not signed in
        currentUser.current = null;
        setStatus('anonymous');
        reachable = true;
      } else {
        // Outage or any other failure: keep everything we already knew.
        setStatus((s) => (s === 'loading' ? 'unknown' : s));
        reachable = err instanceof ApiError && !err.unavailable;
      }
    } finally {
      if (inFlight.current === controller) {
        inFlight.current = null;
        profileFlight.current = null;
        setChecking(false);
      }
    }
    return reachable;
    })();
    profileFlight.current = pending;
    return pending;
  }, []);

  useEffect(() => {
    recheck();
    return () => inFlight.current?.abort();
  }, [recheck]);

  const login = useCallback(async (email, password) => {
    cancelSessionCheck();
    const data = await authApi.login(email, password); // throws on failure: state untouched
    cancelSessionCheck(); // invalidate any check started while login was pending
    currentUser.current = data.user;
    setUser(data.user);
    setStatus('authenticated');
    setSignedOutByUser(false);
    return data.user;
  }, [cancelSessionCheck]);

  const finishVerification = useCallback(async (email) => {
    cancelSessionCheck();
    const version = identityVersion.current;
    const data = await authApi.getMe();
    if (identityVersion.current !== version || !data.user?.email_verified ||
        (email && data.user.email.toLowerCase() !== email.trim().toLowerCase())) {
      throw new Error('Could not confirm your verified session. Please sign in.');
    }
    currentUser.current = data.user;
    setUser(data.user); setStatus('authenticated'); setSignedOutByUser(false);
    return data.user;
  }, [cancelSessionCheck]);

  // Never pretends: the screen is signed out only if the server confirmed it.
  // Returns { ok: true } or { ok: false, message }.
  const logout = useCallback(async () => {
    cancelSessionCheck();
    try {
      await authApi.logout();
    } catch (err) {
      // 401 means the server already considers us signed out; the client cleared state for it.
      if (err instanceof ApiError && err.status === 401 && !err.unavailable) {
        cancelSessionCheck();
        setSignedOutByUser(true);
        currentUser.current = null;
        setUser(null);
        setStatus('anonymous');
        return { ok: true };
      }
      return { ok: false, message: describeError(err).message }; // user, status unchanged
    }
    cancelSessionCheck();
    setSignedOutByUser(true);
    setUser(null);
    currentUser.current = null;
    setStatus('anonymous');
    return { ok: true };
  }, [cancelSessionCheck]);

  const updateUser = useCallback((updated) => {
    if (currentUser.current?.id !== updated.id) return;
    cancelSessionCheck(); // an older GET must not overwrite a saved profile/photo
    currentUser.current = updated;
    setUser(updated);
  }, [cancelSessionCheck]);

  const endSession = useCallback((broadcast = true) => {
    cancelSessionCheck();
    currentUser.current = null;
    setUser(null); setStatus('anonymous'); setSignedOutByUser(true);
    if (broadcast) {
      try { localStorage.setItem('splitter:session-ended', String(Date.now())); } catch { /* storage may be unavailable */ }
    }
  }, [cancelSessionCheck]);
  useEffect(() => {
    const listener = (event) => { if (event.key === 'splitter:session-ended') { endSession(false); window.location.replace('/'); } };
    window.addEventListener('storage', listener);
    return () => window.removeEventListener('storage', listener);
  }, [endSession]);
  const value = useMemo(
    () => ({ user, status, unavailable, checking, signedOutByUser, login, logout, recheck, updateUser, endSession, finishVerification }),
    [user, status, unavailable, checking, signedOutByUser, login, logout, recheck, updateUser, endSession, finishVerification]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

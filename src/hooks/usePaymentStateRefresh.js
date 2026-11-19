import { useEffect, useRef } from 'react';

// Recheck when returning from another tab/device, and after local financial writes.
export default function usePaymentStateRefresh(refresh, busy = false) {
  const latest = useRef({ refresh, busy });
  useEffect(() => { latest.current = { refresh, busy }; }, [refresh, busy]);
  useEffect(() => {
    const update = () => {
      if (!latest.current.busy && document.visibilityState !== 'hidden') latest.current.refresh();
    };
    window.addEventListener('splitter:notifications-changed', update);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    const timer = window.setInterval(update, 60000);
    return () => {
      window.removeEventListener('splitter:notifications-changed', update);
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', update);
      window.clearInterval(timer);
    };
  }, []);
}

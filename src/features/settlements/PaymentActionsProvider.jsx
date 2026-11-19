import { createContext, useContext, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import { getGroups } from '../../api/groups.js';
import { listSettlements, getSettlement } from '../../api/settlements.js';
import { useGroupResource } from '../groups/resources.jsx';

const PaymentActionsContext = createContext(null);
export const usePaymentActions = () => useContext(PaymentActionsContext);

export function actionsForSettlement(group, settlement, userId) {
  if (!userId || settlement?.group_id !== group.id || settlement.status !== 'pending') return [];
  return settlement.transactions.flatMap((item) => {
    const type = item.status === 'pending' && item.payer.id === userId ? 'pay'
      : item.status === 'payment_reported' && item.receiver.id === userId ? 'confirm' : null;
    return type ? [{ type, group, item, settlementId: settlement.id,
      href: `/groups/${group.id}/settlements/${settlement.id}?payment=${encodeURIComponent(item.id)}` }] : [];
  });
}

async function loadActions(userId, signal) {
  const groupPages = [];
  let page = 1, response;
  do {
    response = await getGroups(page++, signal);
    groupPages.push(response);
  } while (response.next);
  const groups = groupPages.flatMap((entry) => entry.results);
  const results = await Promise.allSettled(groups.map(async (group) => {
    const summaries = await listSettlements(group.id, 1, signal);
    const current = summaries.results[0];
    if (current?.status !== 'pending') return [];
    const { settlement } = await getSettlement(current.id, signal);
    return actionsForSettlement(group, settlement, userId);
  }));
  // A revoked group must not retain old actions; failures must not claim all clear.
  const failed = results.some((result) => result.status === 'rejected' && ![403, 404].includes(result.reason.status));
  return { groupPages, actions: results.flatMap((result) => result.status === 'fulfilled' ? result.value : []), failed };
}

function PaymentActionsSession({ userId, children }) {
  const { pathname } = useLocation();
  const [revision, setRevision] = useState(0);
  const resource = useGroupResource((signal) => userId ? loadActions(userId, signal) : Promise.resolve({ groupPages: [], actions: [] }), [userId, pathname, revision]);
  useEffect(() => {
    if (!userId) return;
    let timer;
    let lastActive = 0;
    const refresh = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setRevision((value) => value + 1), 100);
    };
    const active = () => {
      if (document.visibilityState === 'hidden' || Date.now() - lastActive < 5000) return;
      lastActive = Date.now(); refresh();
    };
    window.addEventListener('splitter:notifications-changed', refresh);
    window.addEventListener('focus', active);
    document.addEventListener('visibilitychange', active);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('splitter:notifications-changed', refresh);
      window.removeEventListener('focus', active);
      document.removeEventListener('visibilitychange', active);
    };
  }, [userId]);
  return <PaymentActionsContext.Provider value={resource}>{children}</PaymentActionsContext.Provider>;
}

export default function PaymentActionsProvider({ children }) {
  const { user, status } = useAuth();
  const userId = status === 'authenticated' && user?.email_verified !== false ? user?.id : null;
  return <PaymentActionsSession key={userId ?? 'guest'} userId={userId}>{children}</PaymentActionsSession>;
}

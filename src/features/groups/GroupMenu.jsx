import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

export default function GroupMenu({ group }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const trigger = useRef(null);
  useEffect(() => {
    if (!open) return;
    function dismiss(event) {
      if (event.type === 'keydown' && event.key === 'Escape') { setOpen(false); trigger.current?.focus(); }
      else if (event.type === 'pointerdown' && !root.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('keydown', dismiss); document.addEventListener('pointerdown', dismiss);
    return () => { document.removeEventListener('keydown', dismiss); document.removeEventListener('pointerdown', dismiss); };
  }, [open]);
  return <div className="group-menu" ref={root}>
    <button className="btn btn-secondary" ref={trigger} aria-expanded={open} aria-controls="group-options" onClick={() => setOpen((value) => !value)} aria-label="Group options">•••</button>
    {open && <nav id="group-options" className="group-menu-panel" aria-label="Group options" onClick={() => setOpen(false)}>
      <div className="popover-heading"><strong>Group options</strong><button type="button" className="btn btn-secondary" aria-label="Close group options" onClick={() => { setOpen(false); trigger.current?.focus(); }}>×</button></div>
      <Link to={`/groups/${group.id}/settings`}>Group settings</Link>
      <Link to={`/groups/${group.id}/history`}>History</Link>
      <Link to={`/groups/${group.id}?panel=balances`}>Balances</Link>
    </nav>}
  </div>;
}

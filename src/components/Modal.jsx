import { useEffect, useId, useRef } from 'react';

// Uses the browser's native <dialog>: showModal() gives us focus trapping,
// Esc to close, a backdrop, and focus returning to the opener, for free.
export default function Modal({ open, title, onClose, busy = false, closeLabel, children }) {
  const ref = useRef(null);
  const opener = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      opener.current = document.activeElement;
      dialog.showModal();
    }
    if (!open && dialog.open) {
      dialog.close();
      if (opener.current?.isConnected) opener.current.focus();
    }
  }, [open]);

  return (
    <dialog ref={ref} className="modal" aria-labelledby={titleId} aria-busy={busy || undefined}
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }} onClose={onClose}>
      {open && (
        <>
          <div className="modal-heading"><h2 id={titleId}>{title}</h2>
            <button type="button" className="btn btn-secondary modal-close" disabled={busy} aria-label={closeLabel || `Close ${(title || 'dialog').replace(/\?$/, '').toLowerCase()}`} onClick={onClose}>×</button>
          </div>
          {children}
        </>
      )}
    </dialog>
  );
}

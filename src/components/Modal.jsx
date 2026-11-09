import { useEffect, useId, useRef } from 'react';

// Uses the browser's native <dialog>: showModal() gives us focus trapping,
// Esc to close, a backdrop, and focus returning to the opener, for free.
export default function Modal({ open, title, onClose, children }) {
  const ref = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={ref} className="modal" aria-labelledby={titleId} onClose={onClose}>
      {open && (
        <>
          <h2 id={titleId}>{title}</h2>
          {children}
        </>
      )}
    </dialog>
  );
}
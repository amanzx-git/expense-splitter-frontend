import Button from './Button.jsx';
import Modal from './Modal.jsx';

export default function ConfirmDialog({
  open, title, message, details, confirmLabel = 'Confirm', onConfirm, onCancel, busy = false, busyLabel = 'Processing…',
}) {
  return (
    <Modal open={open} title={title} onClose={onCancel} busy={busy}>
      {message && <p>{message}</p>}
      {details}
      <div className="modal-actions">
        <Button variant="secondary" disabled={busy} onClick={onCancel}>Cancel</Button>
        <Button variant="danger" loading={busy} onClick={onConfirm}>{busy ? busyLabel : confirmLabel}</Button>
      </div>
    </Modal>
  );
}

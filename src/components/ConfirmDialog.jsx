import Button from './Button.jsx';
import Modal from './Modal.jsx';

export default function ConfirmDialog({
  open, title, message, details, confirmLabel = 'Confirm', onConfirm, onCancel,
}) {
  return (
    <Modal open={open} title={title} onClose={onCancel}>
      {message && <p>{message}</p>}
      {details}
      <div className="modal-actions">
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button variant="danger" onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}
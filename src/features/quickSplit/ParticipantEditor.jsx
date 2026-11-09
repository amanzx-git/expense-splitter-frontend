import { useState } from 'react';
import Button from '../../components/Button.jsx';
import Input from '../../components/Input.jsx';
import { validateParticipantName } from '../../utils/validation.js';
import { planRemoval } from './removal.js';

export const MAX_PARTICIPANTS = 20;

// Small helper component used only here: the list shown inside the dialog.
function RemovalConsequences({ name, personId, deleted, changed }) {
  return (
    <div className="stack">
      {deleted.length > 0 && (
        <div>
          <p><strong>Will be deleted ({deleted.length}):</strong></p>
          <ul aria-label="Expenses that will be deleted">
            {deleted.map((e) => (
              <li key={e.id}>
                <span>{e.description}</span>{' '}
                <span className="muted">
                  ({e.payerId === personId ? `paid by ${name}` : `only ${name} was splitting it`})
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {changed.length > 0 && (
        <div>
          <p><strong>Will lose {name} from the split ({changed.length}):</strong></p>
          <ul aria-label={`Expenses that will lose ${name} from the split`}>
            {changed.map((e) => <li key={e.id}>{e.description}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function ParticipantEditor({ participants, expenses, onAdd, onRename, onRemove, askConfirm }) {
  const [newName, setNewName] = useState('');
  const [addError, setAddError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editError, setEditError] = useState('');

  function handleAdd(e) {
    e.preventDefault(); // stop the browser's own form submit / page reload
    if (participants.length >= MAX_PARTICIPANTS) {
      setAddError(`You can add at most ${MAX_PARTICIPANTS} people.`);
      return;
    }
    const { error, value } = validateParticipantName(newName, participants.map((p) => p.name));
    if (error) { setAddError(error); return; }
    onAdd(value);
    setNewName('');
    setAddError('');
  }

  function startEdit(p) {
    setEditingId(p.id);
    setEditName(p.name);
    setEditError('');
  }

  function saveEdit(e) {
    e.preventDefault();
    const others = participants.filter((p) => p.id !== editingId).map((p) => p.name);
    const { error, value } = validateParticipantName(editName, others);
    if (error) { setEditError(error); return; }
    onRename(editingId, value); // no confirmation: expenses reference the stable ID
    setEditingId(null);
  }

  function handleRemove(p) {
    const { deleted, changed } = planRemoval(p.id, expenses);
    if (deleted.length === 0 && changed.length === 0) {
      onRemove(p.id); // nothing depends on them, so remove straight away
      return;
    }
    askConfirm({
      title: `Remove ${p.name}?`,
      message: `${p.name} appears in ${deleted.length + changed.length} expense(s). Nothing changes until you confirm.`,
      details: <RemovalConsequences name={p.name} personId={p.id} deleted={deleted} changed={changed} />,
      confirmLabel: 'Remove',
      onConfirm: () => onRemove(p.id),
    });
  }

  return (
    <div className="stack">
      <form onSubmit={handleAdd} className="stack" noValidate>
        <Input
          label="Person name"
          hint={`Add 2 to ${MAX_PARTICIPANTS} people. Names must be unique.`}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          error={addError}
          maxLength={50}
        />
        <div><Button type="submit">Add person</Button></div>
      </form>

      {participants.length === 0 ? (
        <p className="muted">No people yet.</p>
      ) : (
        <ul className="plain-list" aria-label="People">
          {participants.map((p) => (
            <li key={p.id} className="list-item">
              {editingId === p.id ? (
                <form onSubmit={saveEdit} className="list-item-main stack" noValidate>
                  <Input
                    label={`New name for ${p.name}`}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    error={editError}
                    maxLength={50}
                  />
                  <div className="row">
                    <Button type="submit">Save</Button>
                    <Button variant="secondary" onClick={() => setEditingId(null)}>Cancel</Button>
                  </div>
                </form>
              ) : (
                <>
                  <span className="list-item-main">{p.name}</span>
                  <div className="row">
                    <Button variant="secondary" onClick={() => startEdit(p)} aria-label={`Rename ${p.name}`}>Rename</Button>
                    <Button variant="danger" onClick={() => handleRemove(p)} aria-label={`Remove ${p.name}`}>Remove</Button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
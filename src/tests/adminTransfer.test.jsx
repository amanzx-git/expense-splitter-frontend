import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TransferAdmin from '../features/groups/TransferAdmin.jsx';
import { getMembers, transferAdmin } from '../api/groups.js';
import { selectOption } from './selectOption.js';

vi.mock('../api/groups.js', () => ({ getMembers: vi.fn(), transferAdmin: vi.fn() }));
vi.mock('../hooks/useAuth.js', () => ({ useAuth: () => ({ user: { id: 'self' } }) }));
const group = { id: 'group-1', my_role: 'admin' };
beforeEach(() => {
  vi.clearAllMocks();
  getMembers.mockImplementation(async (id, page) => page === 1 ? { results: [{ user: { id: 'self', username: 'self', full_name: 'Self' } }], next: 'page2' } : { results: [{ user: { id: 'other', username: 'other', full_name: 'Other' } }], next: null });
  transferAdmin.mockResolvedValue({ group: { ...group, my_role: 'member' } });
});
afterEach(cleanup);

it('loads all members and requires explicit confirmation before changing ownership', async () => {
  const onSaved = vi.fn();
  render(<TransferAdmin group={group} onSaved={onSaved} />);
  const selector = await screen.findByRole('combobox', { name: 'New group admin' });
  expect(getMembers).toHaveBeenCalledTimes(2);
  await selectOption(selector, 'other');
  await userEvent.click(screen.getByRole('button', { name: 'Transfer admin ownership' }));
  expect(transferAdmin).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Transfer ownership' }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ ...group, my_role: 'member' }));
  expect(transferAdmin).toHaveBeenCalledExactlyOnceWith('group-1', 'other');
});

it('cancels ownership transfer without a backend write', async () => {
  render(<TransferAdmin group={group} onSaved={vi.fn()} />);
  await selectOption(await screen.findByRole('combobox', { name: 'New group admin' }), 'other');
  await userEvent.click(screen.getByRole('button', { name: 'Transfer admin ownership' }));
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(transferAdmin).not.toHaveBeenCalled();
});

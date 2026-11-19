import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DeleteAccountSection from '../features/account/DeleteAccountSection.jsx';
import ProfilePage from '../pages/ProfilePage.jsx';
import MemberIdentity from '../features/groups/MemberIdentity.jsx';
import UserAvatar from '../components/UserAvatar.jsx';
import { getDeletionEligibility, deleteAccount } from '../api/profile.js';
import { ApiError } from '../api/errors.js';
import { userHandle } from '../utils/identity.js';
import { StrictMode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import HomePage from '../pages/HomePage.jsx';
import { ACCOUNT_DELETED_MESSAGE, readAccountDeletionNotice } from '../utils/accountDeletionNotice.js';

const { endSession, auth } = vi.hoisted(() => ({ endSession: vi.fn(), auth: {
  user: { id: 'user-1', username: 'person', full_name: 'Person', email: 'person@example.com', email_verified: true, upi_id: '' },
} }));
vi.mock('../hooks/useAuth.js', () => ({ useAuth: () => ({ ...auth, endSession }) }));
vi.mock('../api/profile.js', () => ({ getDeletionEligibility: vi.fn(), deleteAccount: vi.fn(), updateProfile: vi.fn(), uploadProfilePhoto: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  getDeletionEligibility.mockResolvedValue({ eligible: true, blockers: [] });
  deleteAccount.mockResolvedValue(null);
});
afterEach(cleanup);

async function open() {
  await userEvent.click(screen.getByRole('button', { name: 'Delete account' }));
  return screen.findByLabelText('Confirm your password');
}
async function confirm() {
  await userEvent.type(await open(), 'Current-password-927!');
  await userEvent.click(screen.getByRole('checkbox'));
}

it('places a red-outline Delete account section after profile photo editing for authenticated users', () => {
  render(<ProfilePage />);
  const section = screen.getByRole('region', { name: 'Delete account' });
  expect(section.compareDocumentPosition(screen.getByRole('button', { name: 'Upload photo' })) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Delete account' })).toHaveClass('btn-danger-outline');
  expect(getDeletionEligibility).not.toHaveBeenCalled();
});

it('first click explains history and does not delete, cancellation clears credentials and restores focus', async () => {
  render(<DeleteAccountSection />);
  await userEvent.type(await open(), 'Private-password');
  expect(screen.getByRole('dialog', { name: 'Delete your account?' })).toBeInTheDocument();
  expect(screen.getByText('Deleted member')).toBeInTheDocument();
  expect(deleteAccount).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByRole('button', { name: 'Delete account' })).toHaveFocus();
  expect(await open()).toHaveValue('');
  expect(screen.getByRole('checkbox')).not.toBeChecked();
});

it('requires both current password and explicit acknowledgement before deleting and navigating home', async () => {
  const onDeleted = vi.fn();
  render(<DeleteAccountSection onDeleted={onDeleted} />);
  const password = await open();
  const final = screen.getByRole('button', { name: 'Permanently delete account' });
  expect(final).toBeDisabled();
  await userEvent.type(password, 'Current-password-927!');
  expect(final).toBeDisabled();
  await userEvent.click(screen.getByRole('checkbox'));
  await userEvent.click(final);
  await waitFor(() => expect(onDeleted).toHaveBeenCalledOnce());
  expect(deleteAccount).toHaveBeenCalledExactlyOnceWith('Current-password-927!');
  expect(endSession).toHaveBeenCalledOnce();
});

it('shows financial and transfer guidance with group links and no final deletion form', async () => {
  getDeletionEligibility.mockResolvedValue({ eligible: false, blockers: [
    { code: 'OUTSTANDING_PAYMENT', message: 'Complete outstanding payments.', group_ids: ['group-1'] },
    { code: 'ADMIN_TRANSFER_REQUIRED', message: 'Transfer admin ownership first.', group_ids: ['group-2'] },
  ] });
  render(<DeleteAccountSection />);
  await userEvent.click(screen.getByRole('button', { name: 'Delete account' }));
  expect(await screen.findByText('Finish your pending payments before deleting your account.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Choose a new admin' })).toHaveAttribute('href', '/groups/group-2/settings');
  expect(screen.queryByLabelText('Confirm your password')).not.toBeInTheDocument();
  expect(deleteAccount).not.toHaveBeenCalled();
  getDeletionEligibility.mockResolvedValue({ eligible: true, blockers: [] });
  await userEvent.click(screen.getByRole('button', { name: 'Check again' }));
  expect(await screen.findByLabelText('Confirm your password')).toBeInTheDocument();
});

it('wrong password clears the password and keeps the account signed in', async () => {
  deleteAccount.mockRejectedValue(new ApiError({ status: 400, code: 'REAUTHENTICATION_FAILED', message: 'Your password is incorrect.' }));
  const onDeleted = vi.fn();
  render(<DeleteAccountSection onDeleted={onDeleted} />);
  await confirm();
  await userEvent.click(screen.getByRole('button', { name: 'Permanently delete account' }));
  expect(await screen.findByText('Your password is incorrect.', { exact: false })).toBeInTheDocument();
  expect(screen.getByLabelText('Confirm your password')).toHaveValue('');
  expect(onDeleted).not.toHaveBeenCalled();
  expect(endSession).not.toHaveBeenCalled();
});

it('rechecks backend blockers when financial state changed after opening', async () => {
  deleteAccount.mockRejectedValue(new ApiError({ status: 409, code: 'ACCOUNT_DELETION_BLOCKED', message: 'Resolve new obligations.' }));
  render(<DeleteAccountSection />);
  await confirm();
  getDeletionEligibility.mockResolvedValue({ eligible: false, blockers: [{ code: 'OUTSTANDING_PAYMENT', message: 'A payment is now pending.', group_ids: ['group-1'] }] });
  await userEvent.click(screen.getByRole('button', { name: 'Permanently delete account' }));
  expect(await screen.findByText('Finish your pending payments before deleting your account.')).toBeInTheDocument();
  expect(screen.queryByLabelText('Confirm your password')).not.toBeInTheDocument();
});

it('blocks duplicate requests and closing the dialog during deletion', async () => {
  let finish;
  deleteAccount.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const onDeleted = vi.fn();
  render(<DeleteAccountSection onDeleted={onDeleted} />);
  await confirm();
  await userEvent.dblClick(screen.getByRole('button', { name: 'Permanently delete account' }));
  expect(deleteAccount).toHaveBeenCalledOnce();
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  finish(null);
  await waitFor(() => expect(onDeleted).toHaveBeenCalledOnce());
});

it('offers retry after eligibility outages without enabling deletion', async () => {
  getDeletionEligibility.mockRejectedValue(new ApiError({ status: 503, code: 'SERVER_UNAVAILABLE', message: 'Unavailable', unavailable: true }));
  render(<DeleteAccountSection />);
  await userEvent.click(screen.getByRole('button', { name: 'Delete account' }));
  expect(await screen.findByText('We cannot connect right now. Please try again.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Permanently delete account' })).not.toBeInTheDocument();
});

it('keeps important privacy details available without crowding the confirmation', async () => {
  render(<DeleteAccountSection />);
  await open();
  expect(screen.getByText('Your account will be deleted. This is permanent and will sign you out everywhere.')).toBeInTheDocument();
  const summary = screen.getByText('What happens to my information?');
  expect(summary.closest('details')).not.toHaveAttribute('open');
  await userEvent.click(summary);
  expect(summary.closest('details')).toHaveAttribute('open');
  expect(summary.closest('details')).toHaveTextContent('Information shared by others may remain');
  expect(summary.closest('details')).toHaveTextContent('removing stored photos may take longer');
});

it('preserves explanations for unfamiliar deletion blockers', async () => {
  getDeletionEligibility.mockResolvedValue({ eligible: false, blockers: [
    { code: 'NEW_FINANCIAL_REVIEW', message: 'Ask your group admin to review this payment.', group_ids: ['group-1'] },
  ] });
  render(<DeleteAccountSection />);
  await userEvent.click(screen.getByRole('button', { name: 'Delete account' }));
  expect(await screen.findByText('Ask your group admin to review this payment.')).toBeInTheDocument();
  expect(screen.queryByLabelText('Confirm your password')).not.toBeInTheDocument();
});

it('uses future and processing wording, and shows success only after deletion is confirmed', async () => {
  let finish;
  deleteAccount.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const onDeleted = vi.fn();
  render(<DeleteAccountSection onDeleted={onDeleted} />);
  await confirm();
  expect(screen.getByText(/Your account will be deleted/)).toBeInTheDocument();
  expect(screen.getByText(/Your profile will be removed/)).toBeInTheDocument();
  expect(readAccountDeletionNotice()).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Permanently delete account' }));
  expect(screen.getByRole('button', { name: 'Deleting your account…' })).toHaveAttribute('aria-busy', 'true');
  expect(onDeleted).not.toHaveBeenCalled();
  expect(screen.queryByText(ACCOUNT_DELETED_MESSAGE)).not.toBeInTheDocument();
  expect(readAccountDeletionNotice()).toBeNull();
  finish(null);
  await waitFor(() => expect(onDeleted).toHaveBeenCalledOnce());
  expect(readAccountDeletionNotice()).toBe(ACCOUNT_DELETED_MESSAGE);
  cleanup();
  render(<StrictMode><MemoryRouter><HomePage /></MemoryRouter></StrictMode>);
  expect(screen.getByRole('status')).toHaveTextContent(ACCOUNT_DELETED_MESSAGE);
  expect(readAccountDeletionNotice()).toBeNull();
  cleanup();
  render(<MemoryRouter><HomePage /></MemoryRouter>);
  expect(screen.queryByText(ACCOUNT_DELETED_MESSAGE)).not.toBeInTheDocument();
});

it('does not leave a deletion success notice after a rejected password', async () => {
  deleteAccount.mockRejectedValue(new ApiError({ status: 400, code: 'REAUTHENTICATION_FAILED', message: 'Your password is incorrect.' }));
  render(<DeleteAccountSection onDeleted={vi.fn()} />);
  await confirm();
  await userEvent.click(screen.getByRole('button', { name: 'Permanently delete account' }));
  expect(await screen.findByText("We couldn't delete your account. Your password is incorrect.")).toBeInTheDocument();
  expect(readAccountDeletionNotice()).toBeNull();
});

it('shows a deleted member without a profile link, old image or username', () => {
  const user = { id: 'deleted-1', username: null, full_name: 'Deleted member', is_deleted: true, profile_photo_url: 'https://example.com/old-private-photo.png' };
  render(<><MemberIdentity user={user} groupId="group-1"><span>@old-name</span></MemberIdentity><UserAvatar user={user} /></>);
  expect(screen.getByText('Deleted member')).toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(document.querySelector('img')).toBeNull();
  expect(screen.queryByText('@old-name')).not.toBeInTheDocument();
  expect(userHandle(user)).toBe('Deleted member');
});

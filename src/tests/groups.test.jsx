import { selectOption } from './selectOption.js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import DashboardPage from '../pages/DashboardPage.jsx';
import GroupPage from '../pages/GroupPage.jsx';
import GroupSettingsPage from '../pages/GroupSettingsPage.jsx';
import GroupMembersPage from '../pages/GroupMembersPage.jsx';
import InvitationsPage from '../pages/InvitationsPage.jsx';
vi.mock('../hooks/useAuth.js', () => ({ useAuth: () => ({ user: { full_name: 'Aman', username: 'aman' } }) }));
const id = '123e4567-e89b-42d3-a456-426614174000';
const other = '123e4567-e89b-42d3-a456-426614174001';
let group, invitations, members, requests, handler;
const page = (results, count = results.length, next = null, previous = null) => ({ count, next, previous, results });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
beforeEach(() => {
  document.cookie = 'csrftoken=f4-token; path=/';
  group = { id, name: 'Goa Trip', description: 'Trip expenses', created_by: id, my_role: 'admin', member_count: 2, created_at: '2026-11-08T10:00:00Z' };
  invitations = [{ id: other, group: { id, name: 'Goa Trip' }, invited_by: { id, username: 'aman' }, invitee: { id: other, username: 'rahul' }, status: 'pending', created_at: group.created_at }];
  members = [{ id, user: { id, username: 'aman', full_name: 'Aman' }, role: 'admin', joined_at: group.created_at }, { id: other, user: { id: other, username: 'rahul', full_name: 'Rahul' }, role: 'member', joined_at: group.created_at }];
  requests = []; handler = null;
  vi.stubGlobal('fetch', vi.fn(async (url, options) => {
    const path = url.replace('/api/v1', '');
    const method = options.method;
    const body = options.body ? JSON.parse(options.body) : undefined;
    requests.push({ path, method, body, headers: options.headers, credentials: options.credentials });
    const custom = handler?.(path, method, body);
    if (custom) return custom;
    if (path === '/groups/' && method === 'POST') { Object.assign(group, body); return json({ group }, 201); }
    if (path.startsWith('/groups/?')) return json(page([group]));
    if (path === `/groups/${id}/`) { if (method === 'PATCH') Object.assign(group, body); return json({ group }); }
    if (path.includes('/members/') && method === 'POST') { members = members.slice(0, 1); group.member_count = 1; return json({ message: 'Member removed' }); }
    if (path.includes('/members/?')) return json(page(members));
    if (path.startsWith('/users/search/')) return json({ results: [{ id: other, username: 'rahul', full_name: 'Rahul' }] });
    if (path === `/groups/${id}/invitations/` && method === 'POST') return json({ invitation: invitations[0] }, 201);
    if (path.startsWith(`/invitations/${other}/`)) {
      invitations[0].status = path.endsWith('/accept/') ? 'accepted' : path.endsWith('/decline/') ? 'declined' : 'cancelled';
      return json({ invitation: invitations[0] });
    }
    if (path.includes('/invitations/?')) {
      const status = new URLSearchParams(path.split('?')[1]).get('status');
      return json(page(invitations.filter((inv) => !status || inv.status === status)));
    }
    throw new Error(`Unexpected request: ${method} ${path}`);
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it.each(['admin', 'member'])('places settlement generation only in the header for %s', async (role) => {
  group.my_role = role;
  handler = (path, method) => {
    if (path.endsWith('/balances/')) return json({ members: [], unsettled_expense_total: '10.00', blockers: [], can_generate_settlement: true });
    if (path.includes('/expenses/?') || path.includes('/settlements/?')) return json(page([]));
    if (path.endsWith('/settlements/') && method === 'POST') return json({ settlement: { id: other, sequence_number: 1, status: 'completed' } }, 201);
  };
  open(`/groups/${id}`);
  await screen.findByRole('button', { name: 'Add an expense' });
  const footer = screen.getByRole('contentinfo', { name: 'Group actions' });
  expect(within(footer).queryByRole('button', { name: 'Generate settlement' })).not.toBeInTheDocument();
  expect(within(footer).queryByText(/view latest settlement/)).not.toBeInTheDocument();
  if (role === 'member') { expect(screen.queryByRole('button', { name: 'Generate settlement' })).not.toBeInTheDocument(); return; }
  const action = await screen.findByRole('button', { name: 'Generate settlement' });
  expect(action.closest('header')).toHaveClass('conversation-header');
  const actions = screen.getByRole('group', { name: 'Group actions' });
  expect(within(actions).getByRole('link', { name: 'Invite members' })).toBeInTheDocument();
  expect(within(actions).getByRole('button', { name: 'Group discussion' })).toBeInTheDocument();
  expect(action.closest('.group-header-actions')).toBe(actions);
  const discussion = screen.getByRole('button', { name: 'Group discussion' });
  expect(within(actions).getByRole('link', { name: 'Invite members' }).nextElementSibling).toBe(discussion);
  expect(discussion.nextElementSibling).toBe(action.closest('.header-generation'));
  expect(actions.nextElementSibling).toBe(screen.getByRole('button', { name: 'Group options' }).closest('.group-menu'));
  await waitFor(() => expect(action).not.toHaveAttribute('title', 'Checking group payments…'));
  await userEvent.click(action);
  await userEvent.click(screen.getByRole('button', { name: 'Create settlement' }));
  expect(await screen.findByRole('link', { name: 'View settlement' })).toHaveAttribute('href', `/groups/${id}/settlements/${other}`);
  expect(requests.filter((request) => request.method === 'POST' && request.path.endsWith('/settlements/'))).toHaveLength(1);
});
it('explains unavailable header generation and prevents confirmation', async () => {
  handler = (path) => {
    if (path.endsWith('/balances/')) return json({ members: [], unsettled_expense_total: '0.00', blockers: ['NO_UNSETTLED_EXPENSES'], can_generate_settlement: false });
    if (path.includes('/expenses/?') || path.includes('/settlements/?')) return json(page([]));
  };
  open(`/groups/${id}`);
  const action = await screen.findByRole('button', { name: 'Generate settlement' });
  await waitFor(() => expect(action).toHaveAttribute('title', 'Add an expense before settling up.'));
  expect(action).toBeVisible();
  expect(action).toHaveAttribute('aria-disabled', 'true');
  await userEvent.click(action);
  expect(screen.getByText('Add an expense before settling up.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Create settlement' })).toBeDisabled();
  expect(requests.some((request) => request.method === 'POST')).toBe(false);
});
it.each([320, 360, 390])('keeps all admin controls mounted in the group header at viewport %ipx', async (width) => {
  const previousWidth = window.innerWidth;
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  handler = (path) => {
    if (path.endsWith('/balances/')) return json({ members: [], unsettled_expense_total: '0.00', blockers: ['NO_UNSETTLED_EXPENSES'], can_generate_settlement: false });
    if (path.includes('/expenses/?') || path.includes('/settlements/?')) return json(page([]));
  };
  try {
    open(`/groups/${id}`);
    const settle = await screen.findByRole('button', { name: 'Generate settlement' });
    const header = settle.closest('header');
    const actions = within(header).getByRole('group', { name: 'Group actions' });
    expect(within(actions).getByRole('link', { name: 'Invite members' })).toHaveAttribute('href', `/groups/${id}/members#invite-members`);
    expect(within(actions).getByRole('button', { name: 'Group discussion' }).nextElementSibling).toBe(settle.closest('.header-generation'));
    expect(actions.nextElementSibling).toBe(within(header).getByRole('button', { name: 'Group options' }).closest('.group-menu'));
    expect(within(header).getByTitle(group.name)).toBeInTheDocument();
    expect(within(header).getByRole('link', { name: '2 members' })).toBeInTheDocument();
    await waitFor(() => expect(settle).toHaveAttribute('aria-disabled', 'true'));
    expect(document.querySelector('.site-header .header-generation')).toBeNull();
  } finally { Object.defineProperty(window, 'innerWidth', { configurable: true, value: previousWidth }); }
});
function open(path) {
  return render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/dashboard" element={<DashboardPage />} />
    <Route path="/groups/:groupId" element={<GroupPage />} />
    <Route path="/groups/:groupId/settings" element={<GroupSettingsPage />} />
    <Route path="/groups/:groupId/members" element={<GroupMembersPage />} />
    <Route path="/invitations" element={<InvitationsPage />} />
  </Routes></MemoryRouter>);
}
it('uses global filtered pending count and paginates groups', async () => {
  handler = (path) => {
    if (path === '/invitations/?page=1&status=pending') return json(page(invitations, 25));
    if (path === '/groups/?page=1') return json(page([group], 21, '/api/v1/groups/?page=2'));
    if (path === '/groups/?page=2') return json(page([{ ...group, name: 'Second page' }], 21, null, '/api/v1/groups/?page=1'));
  };
  open('/dashboard');
  expect(await screen.findByText('25 pending invitations')).toBeInTheDocument();
  expect(await screen.findByRole('link', { name: 'Goa Trip' })).toHaveAttribute('href', `/groups/${id}`);
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(await screen.findByText('Second page')).toBeInTheDocument();
});
it('validates and creates a group with session CSRF, then opens it', async () => {
  group.member_count = 1;
  open('/dashboard');
  expect(screen.queryByLabelText('Group name')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Create group' }));
  const dialog = screen.getByRole('dialog');
  expect(dialog).toHaveTextContent('Create a group and invite your friends.');
  expect(dialog).toHaveTextContent('Payments happen outside Splitter; each receiver confirms receipt.');
  expect(within(dialog).queryByRole('checkbox')).not.toBeInTheDocument();
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Create group' }));
  expect(screen.getByText(/Enter a group name/)).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText('Group name'), ' New trip ');
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Create group' }));
  expect(await screen.findByRole('heading', { name: 'New trip' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Your group is ready!' })).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  const request = requests.find((r) => r.method === 'POST');
  expect(request.body).toEqual({ name: 'New trip', description: '' });
  expect(request.headers['X-CSRFToken']).toBe('f4-token');
  expect(request.credentials).toBe('include');
});
it.each([['admin', 1], ['admin', 2], ['member', 2]])('shows discoverable invitation actions for %s with %s members', async (role, count) => {
  group.my_role = role; group.member_count = count;
  open(`/groups/${id}`);
  const discussion = await screen.findByRole('button', { name: 'Group discussion' });
  const header = within(discussion.closest('header'));
  if (role === 'member') {
    expect(header.queryByRole('link', { name: 'Invite members' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Welcome to your group' })).not.toBeInTheDocument();
    return;
  }
  const invite = header.getByRole('link', { name: 'Invite members' });
  expect(invite).toHaveAttribute('href', `/groups/${id}/members#invite-members`);
  expect(header.getAllByRole('link', { name: 'Invite members' })).toHaveLength(1);
  if (count === 1) expect(screen.getByText('Invite friends to split expenses together.')).toBeInTheDocument();
  else expect(screen.queryByRole('heading', { name: 'Your group is ready!' })).not.toBeInTheDocument();
  await userEvent.click(invite);
  const search = await screen.findByLabelText('Search username');
  await waitFor(() => expect(search).toHaveFocus());
  expect(search.closest('section')).toHaveAttribute('id', 'invite-members');
});
it('edits as admin and refreshes the group header', async () => {
  open(`/groups/${id}`);
  await userEvent.click(await screen.findByRole('button', { name: 'Group options' }));
  await userEvent.click(await screen.findByText('Group settings'));
  const input = await screen.findByLabelText('Group name');
  await userEvent.clear(input); await userEvent.type(input, 'Updated group');
  await userEvent.click(screen.getByRole('button', { name: 'Save group' }));
  expect(await screen.findByRole('heading', { name: 'Updated group' })).toBeInTheDocument();
});
it('keeps management contextual and gives the group menu predictable keyboard dismissal', async () => {
  open(`/groups/${id}`);
  const menu = await screen.findByRole('button', { name: 'Group options' });
  expect(screen.queryByLabelText('Group name')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Group settings' })).toHaveAttribute('href', `/groups/${id}/settings`);
  await userEvent.click(menu);
  const options = within(screen.getByRole('navigation', { name: 'Group options' }));
  expect(options.getAllByRole('link').map((link) => link.textContent)).toEqual(['Group settings', 'History', 'Balances']);
  expect(screen.getByRole('link', { name: 'History' })).toHaveAttribute('href', `/groups/${id}/history`);
  expect(screen.getByRole('link', { name: 'Balances' })).toHaveAttribute('href', `/groups/${id}?panel=balances`);
  await userEvent.keyboard('{Escape}');
  expect(menu).toHaveAttribute('aria-expanded', 'false'); expect(menu).toHaveFocus();
  await userEvent.click(menu);
  await userEvent.click(screen.getByRole('button', { name: 'Close group options' }));
  expect(menu).toHaveAttribute('aria-expanded', 'false'); expect(menu).toHaveFocus();
});
it('opens Discussion from the compact header and closes it with X without exposing a bottom discussion form', async () => {
  handler = (path) => path.includes('/comments/') ? json(page([])) : null;
  open(`/groups/${id}`);
  const discussion = await screen.findByRole('button', { name: 'Group discussion' });
  expect(discussion.closest('header')).toHaveClass('conversation-header');
  expect(screen.queryByLabelText('Group comment')).not.toBeInTheDocument();
  await userEvent.click(discussion);
  expect(await screen.findByLabelText('Group comment')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Close group discussion' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(discussion).toHaveFocus();
});
it('hides edit and membership management from members', async () => {
  group.my_role = 'member';
  const view = open(`/groups/${id}`);
  await screen.findByRole('heading', { name: 'Goa Trip' });
  expect(screen.queryByRole('button', { name: 'Save group' })).not.toBeInTheDocument();
  view.unmount(); open(`/groups/${id}/members`);
  await screen.findByText(/Rahul/);
  expect(screen.queryByRole('button', { name: /Remove @/ })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Search username')).not.toBeInTheDocument();
});
it('shows server field errors and handles hidden resources', async () => {
  handler = (path, method) => method === 'PATCH' ? json({ code: 'VALIDATION_ERROR', message: 'Please correct the highlighted fields.', fields: { name: ['Invalid name'], extra: ['Retain this'] } }, 400) : null;
  const view = open(`/groups/${id}`);
  await userEvent.click(await screen.findByRole('button', { name: 'Group options' }));
  await userEvent.click(await screen.findByText('Group settings'));
  await userEvent.click(await screen.findByRole('button', { name: 'Save group' }));
  expect(await screen.findByText('Error: Invalid name')).toBeInTheDocument();
  expect(screen.getByText('extra: Retain this')).toBeInTheDocument();
  view.unmount(); handler = () => json({ code: 'NOT_FOUND', message: 'Not found.' }, 404);
  open(`/groups/${id}`);
  expect(await screen.findByText('Not found.')).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Goa Trip' })).not.toBeInTheDocument();
});
it('dismisses group creation without submitting and resets the form on reopening', async () => {
  open('/dashboard');
  const launcher = screen.getByRole('button', { name: 'Create group' });
  await userEvent.click(launcher);
  await userEvent.type(screen.getByLabelText('Group name'), 'Unsubmitted plan');
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByLabelText('Group name')).not.toBeInTheDocument();
  expect(launcher).toHaveFocus();
  expect(requests.some((request) => request.method === 'POST')).toBe(false);
  await userEvent.click(launcher);
  expect(screen.getByLabelText('Group name')).toHaveValue('');
});
it('searches and invites by username and refreshes invitations', async () => {
  open(`/groups/${id}/members`);
  await userEvent.type(await screen.findByLabelText('Search username'), 'ra');
  await userEvent.click(screen.getByRole('button', { name: 'Search users' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Invite @rahul' }));
  expect(await screen.findByText('Invitation sent to @rahul.')).toBeInTheDocument();
  expect(requests.find((r) => r.method === 'POST').body).toEqual({ username: 'rahul' });
  await waitFor(() => expect(requests.filter((r) => r.path.includes('/invitations/?')).length).toBeGreaterThan(1));
});
it.each(['accept', 'decline'])('can %s an own invitation and filter its history', async (action) => {
  open('/invitations');
  expect(await screen.findByText(/\d+ pending/)).toBeInTheDocument();
  expect(screen.getByLabelText('Invitation status')).toHaveValue('pending');
  await userEvent.click(await screen.findByRole('button', { name: action === 'accept' ? 'Accept' : 'Decline' }));
  expect(await screen.findByText('No invitations')).toBeInTheDocument();
  expect(requests.some((r) => r.path === `/invitations/${other}/${action}/` && r.method === 'POST')).toBe(true);
  await selectOption(screen.getByLabelText('Invitation status'), action === 'accept' ? 'accepted' : 'declined');
  expect(await screen.findByText('Goa Trip')).toBeInTheDocument();
});
it('cancels admin invitations and filters cancelled history', async () => {
  open(`/groups/${id}/members`);
  await userEvent.click(await screen.findByRole('button', { name: 'Cancel invitation' }));
  expect(await screen.findByText('Invitation cancelled.')).toBeInTheDocument();
  await selectOption(screen.getByLabelText('Invitation status'), 'cancelled');
  expect(await screen.findByText('Invited @rahul')).toHaveTextContent('Cancelled');
});
it('preserves conflict messages while refreshing invitation state', async () => {
  handler = (path, method) => {
    if (method === 'POST' && path.endsWith('/accept/')) { invitations[0].status = 'cancelled'; return json({ code: 'API_ERROR', message: 'This invitation is no longer pending.' }, 409); }
  };
  open('/invitations');
  await userEvent.click(await screen.findByRole('button', { name: 'Accept' }));
  expect(await screen.findByText('This invitation is no longer pending.', { exact: false })).toBeInTheDocument();
  expect(await screen.findByText('No invitations')).toBeInTheDocument();
});
it('confirms removal, handles financial conflicts, then removes successfully', async () => {
  handler = (path, method) => method === 'POST' && path.endsWith('/remove/') ? json({ code: 'MEMBER_HAS_ACTIVE_FINANCIAL_REFERENCES', message: 'This member has active financial references.' }, 409) : null;
  open(`/groups/${id}/members`);
  await userEvent.click(await screen.findByRole('button', { name: 'Remove @rahul' }));
  expect(within(screen.getByRole('dialog')).getByText(/Resolve their expenses and payments first/)).toBeInTheDocument();
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove member' }));
  expect(await screen.findByText('This member has active financial references.', { exact: false })).toBeInTheDocument();
  await screen.findByRole('button', { name: 'Remove @rahul' });
  handler = null;
  await userEvent.click(screen.getByRole('button', { name: 'Remove @rahul' }));
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove member' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Remove @rahul' })).not.toBeInTheDocument());
});

it.each(['Group settings', 'Goa Trip'])('opens settings from the header link %s with keyboard', async (label) => {
  group.my_role = 'member'; open(`/groups/${id}`);
  await screen.findByRole('heading', { name: 'Goa Trip' });
  const header = within(document.querySelector('.conversation-header'));
  const link = header.getByRole('link', { name: label });
  expect(link).toHaveAttribute('href', `/groups/${id}/settings`);
  link.focus(); await userEvent.keyboard('{Enter}');
  expect(await screen.findByRole('heading', { name: 'Group settings', level: 1 })).toBeInTheDocument();
  expect(screen.queryByLabelText('Group name')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Description')).toBeInTheDocument();
});
it('opens the member list from the count and puts authorized invitation controls near the top', async () => {
  open(`/groups/${id}`);
  const count = await screen.findByRole('link', { name: '2 members' });
  expect(screen.getByRole('link', { name: 'Invite members' })).toHaveAttribute('title', 'Invite members');
  await userEvent.click(count);
  expect(await screen.findByRole('heading', { name: 'Members & invitations' })).toBeInTheDocument();
  const invite = await screen.findByRole('heading', { name: 'Invite members' });
  const membersHeading = screen.getByRole('heading', { name: 'Members', exact: true });
  expect(invite.compareDocumentPosition(membersHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Invitations', exact: true })).toBeInTheDocument();
});

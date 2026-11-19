import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';
import GroupExpenses from '../features/expenses/GroupExpenses.jsx';
import DirectChatPage from '../pages/DirectChatPage.jsx';
import MessagesPage from '../pages/MessagesPage.jsx';
import MemberIdentity from '../features/groups/MemberIdentity.jsx';
import MessagesProvider, { MessagesNavLink } from '../features/messaging/MessagesProvider.jsx';

const me = { id: 'me', username: 'aman', full_name: 'Aman', email_verified: true };
const other = { id: 'other', username: 'rahul', full_name: 'Rahul' };
const date = '2026-11-14T10:00:00Z';
let auth, messages, exists, allowed, requests, failSend, older;
vi.mock('../hooks/useAuth.js', () => ({ useAuth: () => auth }));
const message = (id, body, sender_id = 'other') => ({ id, body, sender_id, created_at: date, read_at: null });
const unread = () => messages.filter((item) => item.sender_id !== me.id && !item.read_at).length;
const conversation = () => ({ id: 'conversation', recipient: other, can_send: allowed, profile_group_id: allowed ? 'g' : null, unread_count: unread(), updated_at: date, last_message: messages.at(-1) });
beforeEach(() => {
  auth = { user: me, status: 'authenticated' }; messages = [message('1', 'Hello from Rahul')];
  exists = true; allowed = true; requests = []; failSend = false; older = false;
  document.cookie = 'csrftoken=direct-test; path=/';
  vi.stubGlobal('fetch', vi.fn(async (url, options) => {
    const path = url.replace('/api/v1', '');
    const body = options.body ? JSON.parse(options.body) : null;
    requests.push({ path, method: options.method, body });
    let result;
    if (path.includes('/balances/')) result = { members: [], unsettled_expense_total: '0.00', blockers: ['NO_UNSETTLED_EXPENSES'], can_generate_settlement: false };
    else if (path.includes('/comments/') || path.includes('/expenses/?') || path.includes('/settlements/?')) result = { results: [], count: 0, next: null, previous: null };
    else if (path === '/expenses/expense/') result = { expense: { id: 'expense', group_id: 'g', description: 'Dinner', amount: '10.00', paid_by: other, created_by: other, settlement_id: null, expense_date: '2026-11-14', created_at: date, shares: [{ user: other, amount: '10.00' }] } };
    else if (path === '/messages/unread-count/') result = { unread_count: exists ? unread() : 0 };
    else if (path.startsWith('/messages/conversations/?')) result = { results: exists ? [conversation()] : [], count: exists ? 1 : 0, next: null, previous: null };
    else if (path === '/messages/recipients/other/') result = { recipient: other, conversation: exists ? conversation() : null, can_send: allowed, profile_group_id: 'g' };
    else if (path === '/messages/conversations/conversation/') result = { conversation: conversation() };
    else if (path.startsWith('/groups/g/members/')) result = { user: path.includes('/me/') ? me : other, membership: { group_name: 'Trip', group_id: 'g', role: 'member' } };
    else if (path.endsWith('/read/')) { messages.forEach((item) => { if (item.sender_id !== me.id) item.read_at = date; }); result = { updated: 1, read_at: date }; }
    else if (options.method === 'POST') {
      if (failSend) throw new TypeError('offline');
      if (!allowed) return new Response(JSON.stringify({ code: 'PERMISSION_DENIED', message: 'You can send messages only while you share a group.' }), { status: 403 });
      const item = message('new', body.body, me.id); exists = true; messages.push(item);
      result = { message: item, conversation: conversation() };
    } else if (path.includes('/messages/')) result = { results: path.includes('cursor=older') ? [message('0', 'Earlier message')] : [...messages].reverse(), next: older && !path.includes('cursor=older') ? 'http://localhost/api/v1/messages/conversations/conversation/messages/?cursor=older' : null, previous: null };
    else throw new Error(path);
    return new Response(JSON.stringify(result), { status: 200 });
  }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function open(path = '/messages/conversation') {
  return render(<MemoryRouter initialEntries={[path]}><AuthContext.Provider value={auth}><MessagesProvider><MessagesNavLink /><Routes>
    <Route path="/messages" element={<MessagesPage />} />
    <Route path="/messages/new/:recipientId" element={<DirectChatPage />} />
    <Route path="/messages/:conversationId" element={<DirectChatPage />} />
    <Route path="/groups/:groupId" element={<GroupExpenses group={{ id: 'g', my_role: 'member' }} compact />} />
    <Route path="/profile-other" element={<MemberIdentity groupId="g" user={other} />} />
    <Route path="/profile-self" element={<MemberIdentity groupId="g" user={me} />} />
  </Routes></MessagesProvider></AuthContext.Provider></MemoryRouter>);
}
it('opens the public-profile Message link without creating a conversation until the first send', async () => {
  exists = false; messages = []; open('/profile-other');
  await userEvent.click(screen.getByRole('button', { name: 'Rahul' }));
  await userEvent.click(await screen.findByRole('link', { name: 'Message' }));
  const input = await screen.findByRole('textbox', { name: 'Message' });
  expect(screen.getByText('No messages yet. Say hello.')).toBeInTheDocument();
  expect(requests.some((request) => request.method === 'POST')).toBe(false);
  await userEvent.type(input, 'Hello{Enter}');
  expect(await screen.findByText('Hello')).toBeInTheDocument();
  const sends = requests.filter((request) => request.method === 'POST');
  expect(sends).toHaveLength(1);
  expect(sends[0].path).toBe('/messages/conversations/');
  expect(sends[0].body).toMatchObject({ recipient_id: other.id, body: 'Hello' });
  expect(sends[0].body.client_request_id).toBeTruthy();
});
it('does not show Message on the signed-in member profile', async () => {
  open('/profile-self'); await userEvent.click(screen.getByRole('button', { name: 'Aman' }));
  await screen.findByRole('heading', { name: 'Aman' });
  expect(screen.queryByRole('link', { name: 'Message' })).not.toBeInTheDocument();
});
it('lists inbox preview, unread count and navigates to read the exact conversation', async () => {
  open('/messages');
  const badge = await screen.findByRole('link', { name: 'Messages, 1 unread' });
  expect(badge).toBeInTheDocument();
  const row = await screen.findByRole('link', { name: /Rahul.*Hello from Rahul/ });
  expect(row).toHaveAttribute('href', '/messages/conversation');
  await userEvent.click(row);
  await screen.findByRole('textbox', { name: 'Message' });
  await waitFor(() => expect(screen.getByRole('link', { name: 'Messages' })).not.toHaveAttribute('aria-label', 'Messages, 1 unread'));
  expect(requests.find((request) => request.path.endsWith('/read/')).body).toEqual({ through_message_id: '1' });
});
it('preserves drafts and the request key on failed sends and handles Shift+Enter', async () => {
  failSend = true; open(); const input = await screen.findByRole('textbox', { name: 'Message' });
  expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  expect(input).toHaveAttribute('maxlength', '2000');
  await userEvent.type(input, 'First'); await userEvent.keyboard('{Shift>}{Enter}{/Shift}'); await userEvent.type(input, 'Second{Enter}');
  expect(await screen.findByRole('alert')).toHaveTextContent('We cannot connect');
  expect(input).toHaveValue('First\nSecond');
  failSend = false; await userEvent.click(screen.getByRole('button', { name: 'Send' }));
  await screen.findByText('First Second', { exact: false });
  const sends = requests.filter((request) => request.path.endsWith('/messages/') && request.method === 'POST');
  expect(sends).toHaveLength(2); expect(sends[0].body.client_request_id).toBe(sends[1].body.client_request_id);
  expect(input).toHaveValue('');
  const own = document.querySelector('.direct-message--own'); expect(own).toHaveTextContent('Sent');
  expect(screen.getByText('Hello from Rahul').closest('li')).not.toHaveClass('direct-message--own');
});
it('keeps history read-only after shared eligibility ends', async () => {
  allowed = false; open();
  expect(await screen.findByText('Hello from Rahul')).toBeInTheDocument();
  expect(screen.getByText(/Your conversation history is still available/)).toBeInTheDocument();
  expect(screen.queryByRole('textbox', { name: 'Message' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'View profile' })).not.toBeInTheDocument();
});
it('polls only while visible, merges new messages, and cleans up on unmount', async () => {
  let poll;
  const realInterval = window.setInterval.bind(window);
  vi.spyOn(window, 'setInterval').mockImplementation((callback, ms) => { if (ms === 12000) { poll = callback; return 99999; } return realInterval(callback, ms); });
  const clear = vi.spyOn(window, 'clearInterval');
  const view = open(); await screen.findByText('Hello from Rahul');
  await waitFor(() => expect(messages[0].read_at).toBe(date));
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  const before = requests.length; await act(async () => poll()); expect(requests).toHaveLength(before);
  visibility.mockReturnValue('visible'); messages.push(message('2', 'New reply'));
  await act(async () => poll());
  expect(await screen.findByText('New reply')).toBeInTheDocument();
  expect(screen.getAllByText('Hello from Rahul')).toHaveLength(1);
  view.unmount(); expect(clear).toHaveBeenCalledWith(99999);
});
it('loads older messages by cursor without replacing recent history', async () => {
  older = true; open();
  await userEvent.click(await screen.findByRole('button', { name: 'Older messages' }));
  expect(await screen.findByText('Earlier message')).toBeInTheDocument();
  expect(screen.getByText('Hello from Rahul')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Older messages' })).not.toBeInTheDocument();
});
it('keeps private message text as text, not HTML', async () => {
  messages = [message('1', '<img src=x onerror=alert(1)>')]; open();
  expect(await screen.findByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
  expect(document.querySelector('.direct-chat-feed img')).toBeNull();
});

it('retains a readable unsent draft if membership is revoked while composing', async () => {
  open(); const input = await screen.findByRole('textbox', { name: 'Message' });
  await userEvent.type(input, 'Keep this draft'); allowed = false;
  await userEvent.click(screen.getByRole('button', { name: 'Send' }));
  expect(await screen.findByRole('textbox', { name: 'Unsent message' })).toHaveValue('Keep this draft');
  expect(screen.getByRole('textbox', { name: 'Unsent message' })).toHaveAttribute('readonly');
  expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument();
});

it('returns a clean empty inbox instead of a server error', async () => {
  exists = false; messages = []; open('/messages');
  expect(await screen.findByRole('heading', { name: 'No messages yet.' })).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
it('shows a short network error and successfully retries the inbox request', async () => {
  exists = false; messages = [];
  const handler = fetch.getMockImplementation(); let down = true;
  fetch.mockImplementation((url, options) => {
    if (down && url.includes('/messages/conversations/?')) throw new TypeError('offline');
    return handler(url, options);
  });
  open('/messages');
  expect(await screen.findByRole('alert')).toHaveTextContent('We cannot connect right now. Please try again.');
  down = false; await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('heading', { name: 'No messages yet.' })).toBeInTheDocument();
});
it.each([true, false])('shows Message in an expense member profile, then closes both dialogs on navigation (existing=%s)', async (existing) => {
  exists = existing; if (!existing) messages = [];
  open('/groups/g?expense=expense');
  await userEvent.click(await screen.findByRole('button', { name: 'Paid by Rahul' }));
  const messageLink = await screen.findByRole('link', { name: 'Message' });
  expect(messageLink).toBeVisible(); expect(messageLink).toHaveClass('member-profile-message');
  expect(screen.getAllByRole('dialog')).toHaveLength(2);
  await userEvent.click(messageLink);
  expect(await screen.findByRole('textbox', { name: 'Message' })).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(requests.filter((request) => request.path === '/messages/conversations/' && request.method === 'POST')).toHaveLength(0);
});

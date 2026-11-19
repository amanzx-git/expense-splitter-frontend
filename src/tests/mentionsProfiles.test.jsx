import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Comments from '../features/expenses/Comments.jsx';
import MemberIdentity from '../features/groups/MemberIdentity.jsx';
import { AuthContext } from '../context/AuthContext.jsx';
import { editMentions, trimMentionInput } from '../features/groups/mentionText.js';

let saved, posted, fetchMock;
const users = [{ id: 'a', username: 'aman', full_name: 'Same name' }, { id: 'b', username: 'rahul', full_name: 'Same name' }];
const json = (body) => new Response(JSON.stringify(body), { status: 200 });
beforeEach(() => {
  saved = []; posted = []; document.cookie = 'csrftoken=mentions; path=/';
  fetchMock = vi.fn(async (url, options) => {
    if (url.includes('/members/?')) return json({ results: users.map((user) => ({ user })), next: null });
    if (url.includes('/profile/')) return json({ user: { ...users[1], username: 'renamed', full_name: 'Rahul updated', profile_photo_url: null }, membership: { group_id: 'g', group_name: 'Trip', role: 'member' } });
    if (url.includes('/comments/')) {
      if (options.method === 'POST') { const body = JSON.parse(options.body); posted.push(body); saved = [{ id: 'c', group_id: 'g', author: users[0], text: body.text, created_at: '2026-11-13T10:00:00Z', mentions: body.mentions.map((mention) => ({ ...mention, username_snapshot: users.find((user) => user.id === mention.user_id).username })) }]; return json({ comment: saved[0] }); }
      return json({ results: saved, next: null });
    }
    throw new Error(url);
  }); vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('selects duplicate display names by UUID, supports multiple mentions and opens the renamed member profile', async () => {
  render(<MemoryRouter><Comments groupId="g" /></MemoryRouter>);
  const input = await screen.findByLabelText('Group comment');
  await userEvent.type(input, 'Hi @');
  expect(await screen.findAllByRole('option')).toHaveLength(2);
  await userEvent.keyboard('{ArrowDown}{Enter}');
  expect(input).toHaveValue('Hi @rahul ');
  await userEvent.type(input, 'and @ama');
  await screen.findByRole('option'); await userEvent.keyboard('{Enter}');
  expect(input).toHaveValue('Hi @rahul and @aman ');
  await userEvent.click(screen.getByRole('button', { name: 'Post comment' }));
  const mention = await screen.findByRole('button', { name: '@rahul' });
  expect(posted[0].mentions).toEqual([{ user_id: 'b', start: 3, end: 9 }, { user_id: 'a', start: 14, end: 19 }]);
  expect(posted[0].client_request_id).toMatch(/^[0-9a-f-]{36}$/);
  expect(fetchMock.mock.calls.some(([url]) => url.includes('/profile/'))).toBe(false);
  await userEvent.click(mention);
  expect(await screen.findByText('Rahul updated')).toBeInTheDocument();
  expect(screen.getByText('Member · Trip')).toBeInTheDocument();
  expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/members/b/profile/'))).toBe(true);
  await userEvent.click(screen.getByRole('button', { name: 'Close member profile' }));
  await waitFor(() => expect(mention).toHaveFocus());
});
it('dismisses suggestions with Escape and renders HTML-like comment content as text', async () => {
  saved = [{ id: 'c', author: users[0], text: '<img src=x onerror=alert(1)>', created_at: '2026-11-13T10:00:00Z', mentions: [] }];
  render(<MemoryRouter><Comments groupId="g" /></MemoryRouter>);
  expect(await screen.findByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
  expect(document.querySelector('.comment-text img')).toBeNull();
  await userEvent.type(screen.getByLabelText('Group comment'), '@'); await screen.findAllByRole('option');
  await userEvent.keyboard('{Escape}'); expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});
it('keeps Unicode offsets stable through edits and removes altered mention tokens', () => {
  const mention = { user_id: 'a', start: 2, end: 7 };
  expect(editMentions('😀 @aman', 'X😀 @aman', [mention])[0].start).toBe(3);
  expect(editMentions('😀 @aman', '😀 @other', [mention])).toEqual([]);
  expect(editMentions('😀 @aman', '😀 @amanx', [mention])).toEqual([]);
  expect(trimMentionInput('  @aman ', [{ ...mention, start: 2, end: 7 }])).toEqual({ text: '@aman', mentions: [{ user_id: 'a', start: 0, end: 5 }] });
});
it('closes public profile state when the signed-in account changes', async () => {
  const view = (id) => <MemoryRouter><AuthContext.Provider value={{ user: { id } }}><MemberIdentity groupId="g" user={users[1]} /></AuthContext.Provider></MemoryRouter>;
  const { rerender } = render(view('a'));
  await userEvent.click(screen.getByRole('button')); await screen.findByText('Rahul updated');
  rerender(view('other'));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});
it('supports touch selection and reuses the request key after an uncertain submission', async () => {
  const original = fetchMock.getMockImplementation(); let fail = true;
  fetchMock.mockImplementation(async (url, options) => {
    if (options.method === 'POST' && fail) { fail = false; posted.push(JSON.parse(options.body)); throw new TypeError('offline'); }
    return original(url, options);
  });
  render(<MemoryRouter><Comments groupId="g" /></MemoryRouter>);
  await userEvent.type(await screen.findByLabelText('Group comment'), '@rah');
  fireEvent.pointerDown(await screen.findByRole('option'), { pointerType: 'touch' });
  await userEvent.click(screen.getByRole('button', { name: 'Post comment' }));
  await screen.findByRole('alert');
  await userEvent.click(screen.getByRole('button', { name: 'Post comment' }));
  await screen.findByRole('button', { name: '@rahul' });
  expect(posted).toHaveLength(2);
  expect(posted[0].client_request_id).toBe(posted[1].client_request_id);
  expect(posted[0].mentions).toEqual(posted[1].mentions);
});
it('shows unavailable profiles without reusing stale profile data', async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ code: 'NOT_FOUND', message: 'Member profile unavailable.' }), { status: 404 }));
  render(<MemberIdentity groupId="g" user={users[1]} />);
  await userEvent.click(screen.getByRole('button'));
  expect(await screen.findByText('Member profile unavailable.')).toBeInTheDocument();
  expect(screen.queryByText('Rahul updated')).not.toBeInTheDocument();
});

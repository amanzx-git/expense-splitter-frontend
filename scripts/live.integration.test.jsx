// Real HTTP + PostgreSQL integration. No fetch responses or API functions are mocked.
import { readFile, writeFile } from 'node:fs/promises';
import { afterAll, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { api } from '../src/api/client.js';
import * as auth from '../src/api/auth.js';
import * as profileApi from '../src/api/profile.js';
import * as groups from '../src/api/groups.js';
import * as expenses from '../src/api/expenses.js';
import * as settlements from '../src/api/settlements.js';
import * as notifications from '../src/api/notifications.js';
import { getBalances } from '../src/api/balances.js';
import { parseRupeesToPaise } from '../src/utils/currency.js';
import { AuthProvider } from '../src/context/AuthContext.jsx';
import App from '../src/App.jsx';
import { UNAVAILABLE_MESSAGE } from '../src/api/errors.js';

const realFetch = globalThis.fetch;
const networkTimings = [];
const jars = [new Map(), new Map()];
let active = 0;
const origin = process.env.LIVE_DJANGO_ORIGIN;
if (!origin || !process.env.LIVE_VERIFICATION_FILE) throw new Error('Run using scripts/run_live_integration.py');
const switchUser = (index) => {
  active = index;
  document.cookie = 'csrftoken=; path=/; max-age=0';
  if (jars[index].has('csrftoken')) document.cookie = `csrftoken=${jars[index].get('csrftoken')}; path=/`;
};
// Node fetch has no browser cookie jar. This adapter supplies real server cookies;
// it forwards every request to Django and never replaces any response.
vi.stubGlobal('fetch', async (url, options = {}) => {
  const jar = jars[active];
  const headers = { ...options.headers, Origin: 'http://localhost:5173' };
  if (jar.size) headers.Cookie = [...jar].map(([key, value]) => `${key}=${value}`).join('; ');
  let body = options.body;
  if (body instanceof FormData) {
    // Node fetch cannot serialize jsdom File objects; encode the browser's multipart
    // request here, without changing the actual API client or replacing responses.
    const boundary = 'splitter-' + crypto.randomUUID();
    const chunks = [];
    for (const [name, value] of body.entries()) {
      if (typeof value === 'string') chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
      else {
        const bytes = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsArrayBuffer(value); });
        chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${value.name}"\r\nContent-Type: ${value.type}\r\n\r\n`), Buffer.from(bytes), Buffer.from('\r\n'));
      }
    }
    chunks.push(Buffer.from(`--${boundary}--\r\n`));
    body = Buffer.concat(chunks);
    headers['Content-Type'] = `multipart/form-data; boundary=${boundary}`;
  }
  const started = performance.now();
  const response = await realFetch(url, { ...options, body, headers });
  networkTimings.push({ method: options.method || 'GET', path: new URL(url).pathname, status: response.status, ms: Math.round((performance.now() - started) * 10) / 10 });
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(';')[0]; const index = pair.indexOf('=');
    const key = pair.slice(0, index), value = pair.slice(index+1);
    if (value) jar.set(key, value); else jar.delete(key);
    if (key === 'csrftoken') document.cookie = `csrftoken=${value}; path=/`;
  }
  return response;
});
afterAll(() => vi.unstubAllGlobals());
const delay = () => new Promise((resolve) => setTimeout(resolve, 30));
async function verification(email) {
  for (let retry = 0; retry < 100; retry++) {
    try { const tokens = JSON.parse(await readFile(process.env.LIVE_VERIFICATION_FILE, 'utf8')); if (tokens[email]) return tokens[email]; } catch { /* file being replaced */ }
    await delay();
  }
  throw new Error('No captured verification email');
}
it('completes the real registration-to-payment workflow with session/CSRF and notifications', async () => {
  const accounts = [];
  for (let index = 0; index < 2; index++) {
    switchUser(index);
    const username = index === 0 ? 'live_admin' : 'live_member';
    const email = `${username}@example.com`;
    const registered = await auth.register({ username, full_name: username, email, password: 'Integration-Password-482!', confirm_password: 'Integration-Password-482!', upi_id: index === 0 ? 'liveadmin@bank' : 'livemember@bank' });
    expect(registered.user.email_verified).toBe(false);
    await expect(auth.login(email, 'Integration-Password-482!')).rejects.toMatchObject({ status: 403, code: 'EMAIL_NOT_VERIFIED' });
    const token = await verification(email);
    expect((await auth.verifyEmail(token.uid, token.token)).message).toBe('Email verified');
    await expect(auth.verifyEmail(token.uid, token.token)).rejects.toMatchObject({ status: 400 });
    accounts.push((await auth.login(email, 'Integration-Password-482!')).user);
    expect((await auth.getMe()).user.id).toBe(accounts[index].id);
  }
  switchUser(0);
  const updatedProfile = await profileApi.updateProfile({ full_name: 'Live Admin Updated', username: 'live_admin', upi_id: 'updatedadmin@bank' });
  expect(updatedProfile.user.full_name).toBe('Live Admin Updated');
  expect((await profileApi.getProfile()).user.upi_id).toBe('updatedadmin@bank');
  const photo = new File([await readFile(process.env.LIVE_PHOTO_FILE)], 'photo.png', { type: 'image/png' });
  const uploaded = await profileApi.uploadProfilePhoto(photo);
  expect(uploaded.profile_photo_url).toMatch(/^http:\/\/localhost:\d+\/media\/profiles\//);
  expect((await profileApi.getProfile()).user.profile_photo_url).toBe(uploaded.profile_photo_url);
  const group = (await groups.createGroup({ name: 'F10 live integration', description: 'Isolated temporary database' })).group;
  const invitation = (await groups.inviteUser(group.id, 'live_member')).invitation;
  switchUser(1);
  expect((await notifications.getUnreadCount()).unread_count).toBe(1);
  expect((await groups.getInvitations(null, 'pending', 1)).count).toBe(1);
  await groups.actOnInvitation(invitation.id, 'accept');
  switchUser(0);
  const body = { description: 'Live dinner', amount: '900.01', paid_by: accounts[0].id, participant_ids: accounts.map((user) => user.id), expense_date: '2026-11-13' };
  const created = (await expenses.createExpense(group.id, body)).expense;
  expect(created.shares.reduce((sum, share) => sum + parseRupeesToPaise(share.amount).paise, 0)).toBe(90001);
  const edited = (await expenses.updateExpense(created.id, { amount: '900.02' })).expense;
  expect(edited.amount).toBe('900.02');
  const preview = await getBalances(group.id);
  expect(preview.unsettled_expense_total).toBe('900.02');
  expect(preview.blockers).toEqual([]);
  const first = (await settlements.generateSettlement(group.id)).settlement;
  expect(first.status).toBe('pending'); expect(first.transactions).toHaveLength(1);
  await expect(expenses.updateExpense(created.id, { amount: '10.00' })).rejects.toMatchObject({ status: 409, code: 'EXPENSE_LOCKED' });
  await expect(expenses.deleteExpense(created.id)).rejects.toMatchObject({ status: 409 });
  expect((await getBalances(group.id)).blockers).toContain('ACTIVE_SETTLEMENT_EXISTS');
  const transaction = first.transactions[0];
  expect(transaction.payer.id).toBe(accounts[1].id); expect(transaction.receiver.id).toBe(accounts[0].id);
  switchUser(1);
  expect((await settlements.reportPayment(transaction.id)).transaction.status).toBe('payment_reported');
  await expect(settlements.reportPayment(transaction.id)).rejects.toMatchObject({ status: 409, code: 'INVALID_PAYMENT_STATE' });
  switchUser(0);
  const complete = await settlements.confirmReceipt(transaction.id);
  expect(complete.transaction.status).toBe('done'); expect(complete.settlement_status).toBe('completed');
  expect((await settlements.getSettlement(first.id)).settlement.status).toBe('completed');
  const history = await settlements.listSettlements(group.id, 1);
  expect(history.results[0].confirmed_transaction_count).toBe(1);
  expect(history.results[0].total_transfer_amount).toBe(transaction.amount);
  expect((await getBalances(group.id)).blockers).toEqual(['NO_UNSETTLED_EXPENSES']);
  const list = await notifications.listNotifications(1);
  expect(list.results.some((note) => note.type === 'payment_reported' && note.related_type === 'settlement' && note.related_id === first.id)).toBe(true);
  const note = list.results[0]; const before = (await notifications.getUnreadCount()).unread_count;
  await notifications.markNotificationRead(note.id);
  expect((await notifications.getUnreadCount()).unread_count).toBe(before-1);
  switchUser(1);
  await expect(notifications.markNotificationRead(note.id)).rejects.toMatchObject({ status: 404 });
  expect((await notifications.listNotifications(1)).results.some((item) => item.type === 'payment_confirmed')).toBe(true);
  await auth.logout();
  await expect(auth.getMe()).rejects.toMatchObject({ status: 401 });
});
it('registration OTP automatically signs in and survives dashboard refresh', async () => {
  switchUser(0);
  const actor = userEvent.setup();
  let view = render(<MemoryRouter initialEntries={['/register']}><AuthProvider><App /></AuthProvider></MemoryRouter>);
  await screen.findByRole('heading', { name: 'Create account' });
  const email = 'otp-integration@example.com';
  for (const [label, value] of Object.entries({ Username: 'otp_integration', 'Full name': 'OTP Integration', Email: email, Password: 'Integration-Password-482!', 'Confirm password': 'Integration-Password-482!' })) {
    await actor.type(screen.getByLabelText(label), value);
  }
  await actor.click(screen.getByRole('button', { name: 'Create account' }));
  await screen.findByRole('heading', { name: 'Check your email' }, { timeout: 10000 });
  expect(screen.getByText(`We've sent a 6-digit code to ${email}.`)).toBeInTheDocument();
  expect(screen.getByLabelText('Verification code')).toHaveFocus();
  expect(screen.getAllByRole('textbox')).toHaveLength(6);
  // A real page remount recovers navigation context before verification.
  view.unmount();
  view = render(<MemoryRouter initialEntries={['/verify-email']}><AuthProvider><App /></AuthProvider></MemoryRouter>);
  await screen.findByRole('heading', { name: 'Check your email' }, { timeout: 10000 });
  const delivered = await verification(email);
  expect(delivered.text.split('\n')[0]).toBe('Your Splitter verification code');
  expect(delivered.text.split('\n')[2]).toBe(delivered.code);
  expect(delivered.html.indexOf(delivered.code)).toBeLessThan(delivered.html.indexOf('The code expires'));
  await actor.click(screen.getByLabelText('Verification code'));
  await actor.paste(delivered.code);
  await screen.findByRole('heading', { name: 'Dashboard' }, { timeout: 10000 });
  expect((await auth.getMe()).user).toMatchObject({ email, email_verified: true });
  expect(sessionStorage.getItem('splitter:verification')).toBeNull();
  view.unmount();
  view = render(<MemoryRouter initialEntries={['/dashboard']}><AuthProvider><App /></AuthProvider></MemoryRouter>);
  await screen.findByRole('heading', { name: 'Dashboard' });
  await expect(auth.register({ username: 'otp_retry', full_name: 'OTP Integration', email, password: 'Integration-Password-482!', confirm_password: 'Integration-Password-482!' })).rejects.toMatchObject({ status: 400, fields: { email: expect.any(Array) } });
  view.unmount();
  const registrationRequests = networkTimings.filter(row => row.path === '/api/v1/auth/register/');
  expect(registrationRequests).toHaveLength(2); // one create plus the deliberate duplicate-email check
  const report = { source: 'real HTTP fetch adapter; browser DevTools unavailable', requests: networkTimings.filter(row => /^\/api\/v1\/(auth\/|users\/me\/$)/.test(row.path)) };
  if (process.env.LIVE_TIMINGS_FILE) await writeFile(process.env.LIVE_TIMINGS_FILE, JSON.stringify(report, null, 2));
}, 30000);

it('keeps the actual Quick Split UI usable after the real Django listener stops', async () => {
  await writeFile(process.env.LIVE_STOP_FILE, 'stop');
  let offline = false;
  for (let retry = 0; retry < 100; retry++) {
    try { await realFetch(origin+'/api/v1/auth/csrf/'); } catch { offline = true; break; }
    await delay();
  }
  expect(offline).toBe(true);
  await expect(api.get('/users/me/')).rejects.toMatchObject({ unavailable: true });
  render(<MemoryRouter initialEntries={['/quick-split']}><AuthProvider><App /></AuthProvider></MemoryRouter>);
  expect(await screen.findByText(UNAVAILABLE_MESSAGE)).toBeInTheDocument();
  const user = userEvent.setup();
  for (const name of ['Aman', 'Rahul']) { await user.type(screen.getByLabelText('Person name'), name); await user.click(screen.getByRole('button', { name: 'Add person' })); }
    await user.click(screen.getByRole('button', { name: 'Next: Expenses' }));
    await user.type(screen.getByLabelText('Description'), 'Dinner');
  await user.type(screen.getByLabelText(/Amount/), '100');
  await user.selectOptions(screen.getByLabelText('Paid by'), screen.getAllByRole('option').find((option) => option.textContent === 'Aman').value);
  await user.click(screen.getByRole('button', { name: 'Add expense' }));
  await user.click(screen.getByRole('button', { name: /Calculate/ }));
  expect(await screen.findByText(/Rahul pays Aman/, { selector: 'li' })).toBeInTheDocument();
});



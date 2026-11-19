import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Header from '../components/Header.jsx';
import HomePage from '../pages/HomePage.jsx';

vi.mock('../hooks/useAuth.js', () => ({ useAuth: () => ({ status: 'authenticated', user: { full_name: 'Aman' }, logout: vi.fn() }) }));
vi.mock('../features/notifications/NotificationBell.jsx', () => ({ default: () => <a href="/notifications">Notifications</a> }));
afterEach(cleanup);

it('keeps guest calculator and group navigation clear on the landing page', () => {
  render(<MemoryRouter><HomePage /></MemoryRouter>);
  expect(screen.getByRole('heading', { name: /Split expenses\.\s*Keep friendships simple\./ })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Try Quick Split' })).toHaveAttribute('href', '/quick-split');
  expect(screen.getByRole('link', { name: 'Go to dashboard' })).toHaveAttribute('href', '/dashboard');
  expect(screen.getByText(/Payments happen outside Splitter/)).toBeInTheDocument();
});

it('closes navigation on Escape, restores toggle focus, and preserves secondary actions', async () => {
  const user = userEvent.setup();
  render(<MemoryRouter><Header /></MemoryRouter>);
  const menu = screen.getByRole('button', { name: 'Open navigation' });
  expect(document.querySelectorAll('[data-menu-icon]')).toHaveLength(1);
  expect(menu.querySelector('[data-menu-icon="hamburger"]')).not.toBeNull();
  await user.click(menu);
  expect(menu).toHaveAccessibleName('Close navigation');
  expect(document.querySelectorAll('[data-menu-icon]')).toHaveLength(1);
  expect(menu.querySelector('[data-menu-icon="close"]')).not.toBeNull();
  await user.click(menu);
  expect(menu).toHaveAccessibleName('Open navigation');
  await user.click(menu);
  expect(menu).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('link', { name: 'My groups' })).toHaveAttribute('href', '/dashboard');
  expect(screen.getByRole('link', { name: 'Invitations' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Profile' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  await user.keyboard('{Escape}');
  expect(menu).toHaveAttribute('aria-expanded', 'false');
  expect(menu).toHaveFocus();
  await user.click(menu);
  await user.click(screen.getByRole('link', { name: 'My groups' }));
  expect(menu).toHaveAttribute('aria-expanded', 'false');
  await user.click(menu);
  await user.click(document.body);
  expect(menu).toHaveAttribute('aria-expanded', 'false');
});

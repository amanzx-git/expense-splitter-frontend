import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import UserAvatar from '../components/UserAvatar.jsx';
import { AuthContext } from '../context/AuthContext.jsx';

afterEach(cleanup);
it('uses readable initials with a fixed circular layout and accessible identity', () => {
  render(<UserAvatar user={{ full_name: 'Aman Yadav' }} />);
  expect(screen.getByRole('img', { name: 'Aman Yadav avatar' })).toHaveTextContent('AY');
  expect(screen.getByRole('img')).toHaveStyle({ width: '32px', height: '32px' });
  expect(document.querySelector('img')).toBeNull();
});
it.each([undefined, '', 'javascript:alert(1)', '/relative.png', 'https://user:password@example.com/a.png'])('does not request an absent/invalid photo %s', (url) => {
  render(<UserAvatar user={{ username: 'priya', profile_photo_url: url }} />);
  expect(screen.getByRole('img')).toHaveTextContent('P');
  expect(document.querySelector('img')).toBeNull();
});
it('retains initials while loading, falls back on failure, and retries only when photo changes', () => {
  const user = { id: 'a', full_name: 'Aman Yadav', profile_photo_url: 'https://example.com/a.png' };
  const view = render(<UserAvatar user={user} />);
  const image = document.querySelector('img');
  expect(image).toHaveAttribute('loading', 'lazy');
  expect(image).not.toHaveClass('is-loaded');
  fireEvent.load(image); expect(image).toHaveClass('is-loaded');
  fireEvent.error(image); expect(document.querySelector('img')).toBeNull();
  view.rerender(<UserAvatar user={{ ...user }} />);
  expect(document.querySelector('img')).toBeNull();
  view.rerender(<UserAvatar user={{ ...user, profile_photo_url: 'https://example.com/new.png' }} />);
  expect(document.querySelector('img')).toHaveAttribute('src', 'https://example.com/new.png');
});
it('reuses only the matching signed-in profile and clears it on account switch', () => {
  const member = { id: 'a', username: 'aman' };
  const view = render(<AuthContext.Provider value={{ user: { ...member, full_name: 'Aman', profile_photo_url: 'https://example.com/a.png' } }}><UserAvatar user={member} /></AuthContext.Provider>);
  expect(document.querySelector('img')).toHaveAttribute('src', 'https://example.com/a.png');
  view.rerender(<AuthContext.Provider value={{ user: { id: 'b', username: 'bob', profile_photo_url: 'https://example.com/b.png' } }}><UserAvatar user={member} /></AuthContext.Provider>);
  expect(document.querySelector('img')).toBeNull();
  expect(screen.getByRole('img', { name: 'aman avatar' })).toHaveTextContent('A');
});
it('handles completely missing identities without unrelated fallback imagery', () => {
  render(<UserAvatar />);
  expect(screen.getByRole('img', { name: 'Unknown user avatar' })).toHaveTextContent('?');
});

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Logo from '../components/Logo.jsx';
import Header from '../components/Header.jsx';
import { AuthContext } from '../context/AuthContext.jsx';

describe('Logo', () => {
  it('has the alt text "Splitter" and no inline sizing', () => {
    render(<Logo />);
    const img = screen.getByRole('img', { name: 'Splitter' });
    expect(img).toHaveAttribute('width', '774');
    expect(img).toHaveAttribute('height', '160');
    expect(img.getAttribute('style')).toBeNull(); // size comes from CSS (height only)
  });

  it('uses the white files only when onDark is set', () => {
    const { rerender } = render(<Logo />);
    expect(screen.getByRole('img').getAttribute('src')).toBe('/brand/splitter-logo.png');
    rerender(<Logo onDark />);
    expect(screen.getByRole('img').getAttribute('src')).toBe('/brand/splitter-logo-white.png');
  });

  it('can be decorative when text beside it already says Splitter', () => {
    const { container } = render(<Logo variant="icon" decorative />);
    expect(container.querySelector('img').getAttribute('alt')).toBe('');
  });

  it('switches to the icon on narrow screens in responsive mode', () => {
    const { container } = render(<Logo variant="responsive" />);
    const source = container.querySelector('source');
    expect(source).toHaveAttribute('media', '(max-width: 479px)');
    expect(source.getAttribute('srcset')).toBe('/brand/splitter-icon.png');
  });
});

const signedOut = {
  user: null, status: 'anonymous', unavailable: false, checking: false, signedOutByUser: false,
  login: async () => {}, logout: async () => ({ ok: true }), recheck: async () => true,
};

describe('Header branding', () => {
  it('links the logo to the home page', () => {
    render(
      <MemoryRouter>
        <AuthContext.Provider value={signedOut}>
          <Header />
        </AuthContext.Provider>
      </MemoryRouter>
    );
    expect(screen.getByRole('link', { name: 'Splitter home' })).toHaveAttribute('href', '/');
  });
});
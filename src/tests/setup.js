import '@testing-library/jest-dom/vitest';
import { webcrypto } from 'node:crypto';

// Make sure crypto.randomUUID() exists in tests.
if (!globalThis.crypto?.randomUUID) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

// jsdom has <dialog> but not showModal()/close(). These stand-ins mimic the
// parts our Modal needs: toggling the `open` attribute and firing "close".
if (typeof HTMLDialogElement !== 'undefined') {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute('open', '');
    };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function close() {
      if (!this.hasAttribute('open')) return;
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  }
}
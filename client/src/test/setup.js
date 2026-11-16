import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => cleanup());

// jsdom does not implement scrolling (used to keep the newest message in view).
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

// jsdom does not implement matchMedia (used by the banner carousel).
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  });
}

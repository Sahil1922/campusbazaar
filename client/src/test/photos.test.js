import { afterEach, describe, expect, it, vi } from 'vitest';
import { shrinkPhoto } from '../lib/photos.js';

const fileOf = (bytes, name, type) => new File([new Uint8Array(bytes)], name, { type });

/** Fakes the browser's image decoding and canvas, which jsdom does not implement. */
function fakeBrowser({ width, height, outputBytes = 150_000, decodeFails = false }) {
  const bitmap = { width, height, close: vi.fn() };
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => {
      if (decodeFails) throw new Error('cannot decode');
      return bitmap;
    }),
  );
  const context = { fillRect: vi.fn(), drawImage: vi.fn(), fillStyle: '' };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
  const toBlob = vi
    .spyOn(HTMLCanvasElement.prototype, 'toBlob')
    .mockImplementation((done, type) => done(new Blob([new Uint8Array(outputBytes)], { type })));
  return { bitmap, context, toBlob };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('shrinking photos before upload', () => {
  it('turns a large phone photo into a smaller JPEG at most 1280 pixels wide', async () => {
    const { bitmap, context, toBlob } = fakeBrowser({ width: 4000, height: 3000 });
    const result = await shrinkPhoto(fileOf(6_000_000, 'IMG_2041.png', 'image/png'));

    expect(result.type).toBe('image/jpeg');
    expect(result.name).toBe('IMG_2041.jpg');
    expect(result.size).toBe(150_000);
    expect(context.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 1280, 960);
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.8);
    expect(bitmap.close).toHaveBeenCalled();
  });

  it('keeps a photo that is already small', async () => {
    const { toBlob } = fakeBrowser({ width: 800, height: 600 });
    const small = fileOf(100_000, 'small.jpg', 'image/jpeg');
    expect(await shrinkPhoto(small)).toBe(small);
    expect(toBlob).not.toHaveBeenCalled();
  });

  it('keeps the original when the browser cannot decode it', async () => {
    fakeBrowser({ width: 0, height: 0, decodeFails: true });
    const file = fileOf(2_000_000, 'odd.webp', 'image/webp');
    expect(await shrinkPhoto(file)).toBe(file);
  });

  it('keeps the original when the new copy would not be smaller', async () => {
    fakeBrowser({ width: 2000, height: 1000, outputBytes: 900_000 });
    const file = fileOf(800_000, 'chart.png', 'image/png');
    expect(await shrinkPhoto(file)).toBe(file);
  });
});

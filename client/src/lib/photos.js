// Phone photos are often 3–10 MB and 4000+ pixels wide, far bigger than any page shows them.
// Shrinking them in the browser before upload makes uploads quicker and every page that shows
// the photo load faster. The server still checks type and size; this is only an optimisation.
export const MAX_PHOTO_SIDE = 1280;
const JPEG_QUALITY = 0.8;
const SMALL_ENOUGH_BYTES = 300 * 1024;

/**
 * Returns a smaller JPEG copy of a photo, or the original file when it is already small, cannot
 * be decoded here, or would not get smaller.
 */
export async function shrinkPhoto(file) {
  if (typeof createImageBitmap !== 'function') return file;
  let bitmap;
  try {
    // Browsers apply the photo's EXIF rotation when decoding, so portrait photos stay upright.
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  try {
    const scale = Math.min(1, MAX_PHOTO_SIDE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= SMALL_ENOUGH_BYTES) return file;

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) return file;
    // JPEG has no transparency; a white background keeps transparent PNGs from turning black.
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    if (!blob || blob.size >= file.size) return file;
    const name = `${file.name.replace(/\.[^.]*$/, '') || 'photo'}.jpg`;
    return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() });
  } finally {
    bitmap.close?.();
  }
}

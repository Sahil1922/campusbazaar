import crypto from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import { config } from '../config.js';
import { HttpError } from '../http.js';

export const MAX_IMAGES = 5;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const LISTING_DIR = 'listings';

/**
 * Parses multipart forms with up to MAX_IMAGES files in the `images` field, kept in memory
 * so each file can be checked before anything is written to disk.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: MAX_IMAGES, fileSize: MAX_IMAGE_BYTES, fields: 20, fieldSize: 10 * 1024, parts: 30 },
});

export function parseListingForm(req, res, next) {
  upload.array('images', MAX_IMAGES)(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError) {
      const messages = {
        LIMIT_FILE_SIZE: 'Each photo must be 5 MB or smaller.',
        LIMIT_FILE_COUNT: `Add at most ${MAX_IMAGES} photos.`,
        LIMIT_UNEXPECTED_FILE: `Add at most ${MAX_IMAGES} photos.`,
      };
      return next(new HttpError(400, messages[error.code] ?? 'The upload could not be processed.', [
        { field: 'images', message: messages[error.code] ?? 'The upload could not be processed.' },
      ]));
    }
    return next(error);
  });
}

/** Detects the real image type from the file's first bytes; the browser-sent type is not trusted. */
export function detectImageType(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

/** Validates uploaded files; returns their detected extensions or throws a 400 with a field error. */
export function checkImages(files = []) {
  return files.map((file) => {
    const type = detectImageType(file.buffer);
    if (!type) {
      throw new HttpError(400, 'Some of the information entered is invalid.', [
        { field: 'images', message: `${file.originalname || 'A file'} is not a JPG, PNG or WebP image.` },
      ]);
    }
    return type;
  });
}

/** Writes checked images under a random name; returns paths relative to the upload directory. */
export async function saveImages(files, types) {
  const dir = path.join(config.uploadDir, LISTING_DIR);
  await mkdir(dir, { recursive: true });
  const saved = [];
  try {
    for (let i = 0; i < files.length; i += 1) {
      const relative = `${LISTING_DIR}/${crypto.randomBytes(16).toString('hex')}.${types[i]}`;
      await writeFile(path.join(config.uploadDir, relative), files[i].buffer, { flag: 'wx' });
      saved.push(relative);
    }
    return saved;
  } catch (error) {
    await deleteImages(saved);
    throw error;
  }
}

/** Deletes stored images, ignoring files that are already gone. Only paths inside the upload directory are touched. */
export async function deleteImages(relativePaths) {
  const root = path.resolve(config.uploadDir);
  await Promise.all(
    relativePaths.map(async (relative) => {
      const full = path.resolve(root, relative);
      if (!full.startsWith(root + path.sep)) return;
      try {
        await unlink(full);
      } catch (error) {
        if (error.code !== 'ENOENT') console.error('Could not delete image', relative, error);
      }
    }),
  );
}

export const imageUrl = (relativePath) => `/uploads/${relativePath}`;

// Profile photos. The app sends a small square JPEG; the server keeps it only
// if it really is one and of a sensible size, and removes its metadata first:
// EXIF can carry where the photo was taken, the phone, the date.

import { LESSON_IMAGE_MAX_BYTES, LESSON_IMAGE_MAX_HEIGHT_PX, LESSON_IMAGE_WIDTH_PX, PHOTO_MAX_BYTES } from '../../shared/rules';

const SOI = 0xd8; // start of image
const SOS = 0xda; // start of scan: the image data follows, to the end of the file
const EOI = 0xd9; // end of image

// Segments kept: APP0 (JFIF) and APP14 (Adobe colour transform) change how the
// image looks. APP1–APP13 and APP15 (EXIF, XMP, ICC, maker notes…) and comments are dropped.
const dropped = (marker: number) => (marker >= 0xe1 && marker <= 0xef && marker !== 0xee) || marker === 0xfe;

/** The JPEG without its metadata segments, or null when the bytes are not a well-formed JPEG header. */
export function stripJpegMetadata(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== SOI) return null;
  const kept: Uint8Array[] = [bytes.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1];
    if (marker === 0xff) {
      i++; // fill byte
      continue;
    }
    if (marker === SOS) {
      kept.push(bytes.subarray(i));
      return concat(kept);
    }
    if (marker === EOI || marker === SOI) return null;
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    if (length < 2 || i + 2 + length > bytes.length) return null;
    if (!dropped(marker)) kept.push(bytes.subarray(i, i + 2 + length));
    i += 2 + length;
  }
  return null;
}

function concat(parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/**
 * The width and height in a JPEG's frame header (a SOF segment), or null when
 * there is none before the image data. Markers C4, C8 and CC share the range
 * but are not frame headers.
 */
export function jpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  let i = 2;
  while (i + 4 <= bytes.length && bytes[i] === 0xff) {
    const marker = bytes[i + 1];
    if (marker === 0xff) {
      i++;
      continue;
    }
    if (marker === SOS || marker === EOI) return null;
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (i + 9 > bytes.length) return null;
      return { height: (bytes[i + 5] << 8) | bytes[i + 6], width: (bytes[i + 7] << 8) | bytes[i + 8] };
    }
    i += 2 + length;
  }
  return null;
}

function decode(base64: string, maxBytes: number) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return null;
  const bytes = new Uint8Array(Buffer.from(base64, 'base64'));
  if (bytes.length === 0 || bytes.length > maxBytes) return null;
  return stripJpegMetadata(bytes);
}

/** Decodes and checks an uploaded photo. null = not a JPEG, or too big. */
export function readPhoto(base64: string): Uint8Array | null {
  return decode(base64, PHOTO_MAX_BYTES);
}

/** Decodes and checks a lesson's picture. null = not a JPEG, too big, or larger than the app and panel make one. */
export function readLessonImage(base64: string): { jpeg: Uint8Array; width: number; height: number } | null {
  const jpeg = decode(base64, LESSON_IMAGE_MAX_BYTES);
  const size = jpeg && jpegSize(jpeg);
  if (!jpeg || !size || size.width < 1 || size.height < 1) return null;
  if (size.width > LESSON_IMAGE_WIDTH_PX || size.height > LESSON_IMAGE_MAX_HEIGHT_PX) return null;
  return { jpeg, ...size };
}

/** Where the app finds a lesson's picture. A picture never changes; a new one has a new id. */
export const lessonImageUrl = (id: string) => `/api/lesson-images/${encodeURIComponent(id)}`;

/** Where the app finds a person's photo. The version changes with each new photo, so caches never show an old one. */
export const photoUrl = (userId: string, at: Date) => `/api/users/${encodeURIComponent(userId)}/photo?v=${at.getTime()}`;

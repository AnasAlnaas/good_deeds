// A lesson's picture in the panel, and making one from a file. Pictures are
// served only with the sign-in token, so an <img src> cannot load one
// directly: it is fetched and shown from a local copy.

import { useEffect, useState } from 'react';

import type { LessonImageRef } from '../../shared/api';
import { LESSON_IMAGE_MAX_BYTES, LESSON_IMAGE_MAX_HEIGHT_PX, LESSON_IMAGE_WIDTH_PX, youtubeThumbnail, youtubeWatchUrl } from '../../shared/rules';
import { api } from './api';

export function LessonPicture({ image, alt }: { image: LessonImageRef; alt: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    let local: string | null = null;
    api
      .photo(image.url, abort.signal)
      .then((blob) => {
        local = URL.createObjectURL(blob);
        setSrc(local);
      })
      .catch(() => {});
    return () => {
      abort.abort();
      if (local) URL.revokeObjectURL(local);
      setSrc(null);
    };
  }, [image.url]);

  // The space it will take, before it loads.
  const style = { aspectRatio: `${image.width} / ${image.height}` };
  if (!src) return <div className="lesson-picture" style={style} aria-hidden="true" />;
  return (
    <a href={src} target="_blank" rel="noreferrer" title={alt}>
      <img className="lesson-picture" style={style} src={src} alt={alt} />
    </a>
  );
}

/** A lesson's YouTube video: its still picture, opening the video on YouTube. */
export function LessonVideo({ videoId, label }: { videoId: string; label: string }) {
  return (
    <a className="lesson-video" href={youtubeWatchUrl(videoId)} target="_blank" rel="noreferrer" title={label}>
      <img src={youtubeThumbnail(videoId)} alt={label} />
      <span className="lesson-video-play" aria-hidden="true">
        ▶
      </span>
    </a>
  );
}

/**
 * The file as a lesson's picture: at most LESSON_IMAGE_WIDTH_PX wide and
 * LESSON_IMAGE_MAX_HEIGHT_PX tall, uncropped, on white (a PNG's transparent
 * parts would turn black), compressed more until it fits LESSON_IMAGE_MAX_BYTES.
 * Base64; `too_big` when it never fits; `unreadable` when it is no picture.
 */
export async function lessonJpeg(file: File): Promise<string | 'too_big' | 'unreadable'> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return 'unreadable';
  const scale = Math.min(1, LESSON_IMAGE_WIDTH_PX / bitmap.width, LESSON_IMAGE_MAX_HEIGHT_PX / bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(bitmap.width * scale));
  canvas.height = Math.max(1, Math.floor(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return 'unreadable';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [0.85, 0.7, 0.55, 0.4]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (blob && blob.size <= LESSON_IMAGE_MAX_BYTES) return base64(blob);
  }
  return 'too_big';
}

function base64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

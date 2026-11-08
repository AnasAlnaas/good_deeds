// Choosing a profile photo: from the phone's photos (Android's photo picker
// needs no permission) or the camera (asks once). The result is made small and
// square here, so what reaches the server is a JPEG of a few dozen KB. The
// server removes any metadata left in it.

import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { LESSON_IMAGE_MAX_BYTES, LESSON_IMAGE_MAX_HEIGHT_PX, LESSON_IMAGE_WIDTH_PX, PHOTO_SIZE_PX } from '../../../shared/rules';

export type PhotoSource = 'library' | 'camera';

/** The chosen photo as a square JPEG in base64; `denied` when the camera is not allowed; null when cancelled. */
export async function pickPhoto(source: PhotoSource): Promise<string | 'denied' | null> {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return 'denied';
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 };
  const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? null : result.assets[0];
  return asset ? squareJpeg(asset) : null;
}

async function squareJpeg({ uri, width, height }: ImagePicker.ImagePickerAsset) {
  const context = ImageManipulator.manipulate(uri);
  // The crop screen usually makes it square already; when it did not (web, or a phone without one), take the middle.
  if (width && height && width !== height) {
    const side = Math.min(width, height);
    context.crop({ originX: Math.floor((width - side) / 2), originY: Math.floor((height - side) / 2), width: side, height: side });
  }
  if (!width || Math.min(width, height) > PHOTO_SIZE_PX) context.resize({ width: PHOTO_SIZE_PX });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
  return saved.base64 ?? null;
}

/** A lesson's picture, ready to send (shared/api.ts LessonImageBody). */
export type LessonPictureFile = { base64: string; width: number; height: number };

/**
 * A picture for a lesson (an infographic, a diagram), from the phone's photos,
 * uncropped: its words must stay readable. Made at most LESSON_IMAGE_WIDTH_PX
 * wide and LESSON_IMAGE_MAX_HEIGHT_PX tall, then compressed more until it fits
 * LESSON_IMAGE_MAX_BYTES. `too_big` when even then it does not; null when cancelled.
 */
export async function pickLessonPicture(): Promise<LessonPictureFile | 'too_big' | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;
  const { uri, width, height } = asset;
  const context = ImageManipulator.manipulate(uri);
  const scale = width && height ? Math.min(1, LESSON_IMAGE_WIDTH_PX / width, LESSON_IMAGE_MAX_HEIGHT_PX / height) : 1;
  if (scale < 1) context.resize({ width: Math.floor(width * scale), height: Math.floor(height * scale) });
  else if (!width || !height) context.resize({ width: LESSON_IMAGE_WIDTH_PX });
  const image = await context.renderAsync();
  for (const compress of [0.85, 0.7, 0.55, 0.4]) {
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress, base64: true });
    // base64 takes 4 characters for every 3 bytes.
    if (saved.base64 && (saved.base64.length * 3) / 4 <= LESSON_IMAGE_MAX_BYTES) {
      return { base64: saved.base64, width: saved.width, height: saved.height };
    }
  }
  return 'too_big';
}

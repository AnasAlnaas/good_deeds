// Choosing a profile photo: from the phone's photos (Android's photo picker
// needs no permission) or the camera (asks once). The result is made small and
// square here, so what reaches the server is a JPEG of a few dozen KB. The
// server removes any metadata left in it.

import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { PHOTO_SIZE_PX } from '../../../shared/rules';

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

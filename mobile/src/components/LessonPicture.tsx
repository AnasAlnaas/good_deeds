import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';

import type { LessonImageRef } from '@/data/api';
import { useApp } from '@/state/app';
import { colors, radius } from '@/theme/tokens';

/**
 * A lesson's picture (an infographic, a diagram), the full width and its own
 * shape, so its words stay as readable as the phone allows. `maxHeight` shrinks
 * it whole, for a preview. On the server it is served only to signed-in people.
 */
export function LessonPicture({ image, label, maxHeight }: { image: LessonImageRef; label: string; maxHeight?: number }) {
  const { photoSource } = useApp();
  const source = photoSource(image.url);
  if (!source) return null;
  return (
    <Image
      source={source}
      accessibilityLabel={label}
      style={[styles.picture, { aspectRatio: image.width / image.height }, maxHeight ? { maxHeight } : null]}
      contentFit="contain"
      transition={150}
      accessibilityIgnoresInvertColors
    />
  );
}

const styles = StyleSheet.create({
  picture: { width: '100%', borderRadius: radius.card, backgroundColor: colors.surfaceAlt },
});

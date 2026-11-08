import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { PictureViewer } from '@/components/PictureViewer';
import type { LessonImageRef } from '@/data/api';
import { useApp } from '@/state/app';
import { colors, radius, space } from '@/theme/tokens';

/**
 * A lesson's picture (an infographic, a diagram), the full width and its own
 * shape. Tapping it opens it on the whole screen, to zoom into its words.
 * `maxHeight` shrinks it whole, for a preview. On the server it is served only
 * to signed-in people.
 */
export function LessonPicture({ image, label, maxHeight }: { image: LessonImageRef; label: string; maxHeight?: number }) {
  const { s, photoSource } = useApp();
  const [open, setOpen] = useState(false);
  const source = photoSource(image.url);
  if (!source) return null;
  return (
    <>
      <Pressable accessibilityRole="imagebutton" accessibilityLabel={`${label}. ${s.learn.openPicture}`} onPress={() => setOpen(true)}>
        <Image
          source={source}
          style={[styles.picture, { aspectRatio: image.width / image.height }, maxHeight ? { maxHeight } : null]}
          contentFit="contain"
          transition={150}
          accessibilityIgnoresInvertColors
        />
        <View style={styles.zoom} pointerEvents="none">
          <Ionicons name="expand" size={18} color={colors.surface} />
        </View>
      </Pressable>
      {open && <PictureViewer source={source} label={label} onClose={() => setOpen(false)} />}
    </>
  );
}

const styles = StyleSheet.create({
  picture: { width: '100%', borderRadius: radius.card, backgroundColor: colors.surfaceAlt },
  // A small sign that the picture opens larger.
  zoom: {
    position: 'absolute',
    bottom: space.sm,
    end: space.sm,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

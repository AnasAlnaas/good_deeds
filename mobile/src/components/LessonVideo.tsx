import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { YouTubePlayer } from '@/components/YouTubePlayer';
import { fmt } from '@/i18n/format';
import { useApp } from '@/state/app';
import { colors, radius } from '@/theme/tokens';
import { youtubeThumbnail, youtubeWatchUrl } from '../../../shared/rules';

/**
 * A lesson's YouTube video: its still picture with a play button, so nothing
 * loads (and no data is spent) until it is tapped; then it plays here. Opening
 * it in YouTube is always offered, for a slow connection or a video its owner
 * lets play on YouTube only.
 */
export function LessonVideo({ videoId, title }: { videoId: string; title: string }) {
  const { s } = useApp();
  const [playing, setPlaying] = useState(false);
  const label = fmt(s.learn.playVideo, { title });
  return (
    <View style={styles.wrap}>
      <View style={styles.frame}>
        {playing ? (
          <YouTubePlayer videoId={videoId} title={label} />
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => setPlaying(true)} style={styles.fill}>
            <Image source={{ uri: youtubeThumbnail(videoId) }} style={styles.fill} contentFit="cover" transition={150} accessibilityIgnoresInvertColors />
            <View style={styles.play}>
              <Ionicons name="play" size={30} color="#fff" style={styles.playIcon} />
            </View>
          </Pressable>
        )}
      </View>
      <Button variant="quiet" icon="logo-youtube" label={s.learn.openYoutube} onPress={() => Linking.openURL(youtubeWatchUrl(videoId)).catch(() => {})} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4 },
  frame: { width: '100%', aspectRatio: 16 / 9, borderRadius: radius.card, overflow: 'hidden', backgroundColor: '#000' },
  fill: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  play: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary,
    opacity: 0.92,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The triangle sits a little right of the middle, where the eye expects it.
  playIcon: { marginLeft: 4 },
});

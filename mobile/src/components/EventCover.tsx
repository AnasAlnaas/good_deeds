import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import type { LessonImageRef } from '@/data/api';
import { useApp } from '@/state/app';
import { classCover, classIcon, type EventClassId } from '@/theme/classes';
import { colors, radius, space } from '@/theme/tokens';
import { Txt } from './Txt';

/**
 * An event's cover (owner's decision, 2026-11-17, design ج): the photo its
 * proposer chose, or, without one, a cover drawn from its class: the class's
 * colour, a few rings in the spirit of the logo, and its icon large. `title`
 * is written over its bottom; `date` sits in a chip at its top corner.
 */
export function EventCover({
  cover,
  eventClass,
  height,
  title,
  date,
  rounded,
  children,
}: {
  cover: LessonImageRef | null | undefined;
  eventClass: EventClassId;
  height: number;
  title?: string;
  date?: string;
  /** Rounded at the top, to sit at the top of a card. */
  rounded?: boolean;
  children?: ReactNode;
}) {
  const { photoSource } = useApp();
  const look = classCover(eventClass);
  const source = cover ? photoSource(cover.url) : null;
  return (
    <View style={[styles.cover, { height, backgroundColor: look.background }, rounded && styles.rounded]} accessible={false}>
      {source ? (
        <Image source={source} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} accessibilityIgnoresInvertColors />
      ) : (
        <>
          <View style={[styles.ring, { borderColor: look.ring, width: height * 1.4, height: height * 1.4, top: -height * 0.5, start: -height * 0.4 }]} />
          <View style={[styles.ring, { borderColor: look.ring, width: height * 0.9, height: height * 0.9, bottom: -height * 0.35, end: -height * 0.1 }]} />
          <View style={styles.center}>
            <Ionicons name={classIcon(eventClass)} size={Math.min(56, height * 0.42)} color={look.ink} />
          </View>
        </>
      )}
      {date && (
        <View style={styles.date}>
          <Txt variant="caption" color={colors.ink} label>
            {date}
          </Txt>
        </View>
      )}
      {title && (
        <View style={styles.band}>
          <Txt variant="sectionTitle" color="#FFFFFF" numberOfLines={2}>
            {title}
          </Txt>
        </View>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { overflow: 'hidden', justifyContent: 'flex-end' },
  rounded: { borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card },
  ring: { position: 'absolute', borderWidth: 14, borderRadius: 999, opacity: 0.55 },
  center: { position: 'absolute', top: 0, bottom: 0, start: 0, end: 0, alignItems: 'center', justifyContent: 'center', paddingBottom: space.lg },
  date: {
    position: 'absolute',
    top: space.sm,
    start: space.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm + 2,
    paddingVertical: 2,
  },
  // A dark band under the title, so it reads on any photo.
  band: { backgroundColor: 'rgba(23, 35, 29, 0.62)', paddingHorizontal: space.md, paddingVertical: space.sm },
});

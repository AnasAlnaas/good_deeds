import { Ionicons } from '@expo/vector-icons';
import { type ReactNode, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { EventDetail, EventSummary, LessonLibraryItem } from '@/data/api';
import { useEvents } from '@/data/queries';
import { date, fmt } from '@/i18n/format';
import { useApp } from '@/state/app';
import { classIcon } from '@/theme/classes';
import { colors, radius, space, touch } from '@/theme/tokens';
import { lessonKey } from '../../../shared/lesson-library';
import { Button } from './Button';
import { Txt } from './Txt';
import { Badge, Card, Field, IconButton } from './ui';

// Starting a new event from an earlier one (CopyEvent), and adding a lesson an
// earlier event had (LessonLibrary). Both fill the form only: nothing is sent
// until the person sends the new event, which the association reviews as any.

/** The events a person may start a new one from: those they proposed or supervise, the latest first. */
export function copyableEvents(events: EventSummary[] | undefined) {
  return (events ?? []).filter((e) => e.i_created || e.i_organize).sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at));
}

/**
 * At the top of a new event's form: start it from an earlier event, or, once
 * copied, say so and offer to start blank again. `onCopy(null)` = start blank.
 */
export function CopyEvent({ copied, onCopy }: { copied: EventDetail | null; onCopy: (id: string | null) => void }) {
  const { s, lang } = useApp();
  const events = copyableEvents(useEvents().data);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? events.filter((e) => e.title.toLowerCase().includes(q)) : events;
  }, [events, search]);

  if (copied) {
    return (
      <Card style={styles.copied}>
        <View style={styles.line}>
          <Ionicons name="copy-outline" size={20} color={colors.primary} />
          <Txt variant="bodyStrong" style={styles.flex}>
            {fmt(s.copyEvent.copiedFrom, { title: copied.title })}
          </Txt>
        </View>
        <Txt variant="caption" color={colors.inkMuted}>
          {s.copyEvent.checkDetails}
        </Txt>
        <Button variant="quiet" icon="refresh" label={s.copyEvent.startBlank} onPress={() => onCopy(null)} />
      </Card>
    );
  }
  if (events.length === 0) return null;

  const close = () => {
    setOpen(false);
    setSearch('');
  };

  return (
    <>
      <Button variant="secondary" icon="copy-outline" label={s.copyEvent.fromEarlier} onPress={() => setOpen(true)} />
      <Sheet open={open} title={s.copyEvent.pickTitle} hint={s.copyEvent.pickHint} onClose={close}>
        <View style={styles.search}>
          <Field label={s.copyEvent.search} value={search} onChangeText={setSearch} autoCorrect={false} />
        </View>
        <FlatList
          data={shown}
          keyExtractor={(e) => e.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Txt color={colors.inkMuted}>{s.copyEvent.none}</Txt>}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={fmt(s.copyEvent.copyThis, { title: item.title })}
              onPress={() => {
                close();
                onCopy(item.id);
              }}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
              <Ionicons name={classIcon(item.event_class)} size={22} color={colors.primary} />
              <View style={styles.flex}>
                <Txt variant="bodyStrong" numberOfLines={2}>
                  {item.title}
                </Txt>
                <Txt variant="caption" color={colors.inkMuted}>
                  {date(item.starts_at, s)}
                  {item.status === 'draft' ? ` · ${s.copyEvent.waiting}` : item.status === 'rejected' ? ` · ${s.copyEvent.rejected}` : ''}
                </Txt>
              </View>
              <Ionicons name={lang === 'ar' ? 'chevron-back' : 'chevron-forward'} size={20} color={colors.inkMuted} />
            </Pressable>
          )}
        />
      </Sheet>
    </>
  );
}

/**
 * Under a form's lessons: add one an earlier event had. It is added as a copy
 * (with the same picture and video), which the person may then change. Those
 * already in the form say so instead.
 */
export function LessonLibrary({
  library,
  inForm,
  onAdd,
}: {
  library: LessonLibraryItem[];
  /** The lessons the form has now, to tell which of the library's are in it. */
  inForm: { title: string; body: string; image_id: string | null; video_id: string | null }[];
  onAdd: (lesson: LessonLibraryItem) => void;
}) {
  const { s } = useApp();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const added = useMemo(() => new Set(inForm.map(lessonKey)), [inForm]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return library;
    return library.filter((l) => [l.title, l.body, l.event_title].some((x) => x.toLowerCase().includes(q)));
  }, [library, search]);

  if (library.length === 0) return null;
  const close = () => {
    setOpen(false);
    setSearch('');
  };

  return (
    <>
      <Button variant="secondary" icon="library-outline" label={s.copyEvent.fromLibrary} onPress={() => setOpen(true)} />
      <Sheet open={open} title={s.copyEvent.libraryTitle} hint={s.copyEvent.libraryHint} onClose={close}>
        <View style={styles.search}>
          <Field label={s.copyEvent.searchLessons} value={search} onChangeText={setSearch} autoCorrect={false} />
        </View>
        <FlatList
          data={shown}
          keyExtractor={(l) => l.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Txt color={colors.inkMuted}>{s.copyEvent.noLessons}</Txt>}
          renderItem={({ item }) => {
            const isIn = added.has(lessonKey({ ...item, image_id: item.image?.id ?? null }));
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: isIn }}
                accessibilityLabel={isIn ? fmt(s.copyEvent.lessonAdded, { title: item.title }) : fmt(s.copyEvent.addThis, { title: item.title })}
                disabled={isIn}
                onPress={() => {
                  onAdd(item);
                  close();
                }}
                style={({ pressed }) => [styles.row, styles.lessonRow, isIn && styles.isIn, pressed && styles.pressed]}>
                <View style={styles.flex}>
                  <Txt variant="bodyStrong" numberOfLines={2}>
                    {item.title}
                  </Txt>
                  {!!item.body && (
                    <Txt variant="caption" color={colors.inkMuted} numberOfLines={2}>
                      {item.body}
                    </Txt>
                  )}
                  <View style={styles.badges}>
                    {item.mine && <Badge label={s.copyEvent.mine} icon="person-outline" />}
                    {item.image && <Badge label={s.copyEvent.hasPicture} icon="image-outline" color={colors.inkMuted} />}
                    {item.video_id && <Badge label={s.copyEvent.hasVideo} icon="logo-youtube" color={colors.inkMuted} />}
                  </View>
                  <Txt variant="caption" color={colors.inkMuted} numberOfLines={1}>
                    {fmt(s.copyEvent.fromEvent, { title: item.event_title })}
                  </Txt>
                </View>
                <Ionicons name={isIn ? 'checkmark-circle' : 'add-circle-outline'} size={24} color={isIn ? colors.success : colors.primary} />
              </Pressable>
            );
          }}
        />
      </Sheet>
    </>
  );
}

/** A full-screen list over the form, as the city picker (CityPicker.tsx). */
function Sheet({ open, title, hint, onClose, children }: { open: boolean; title: string; hint: string; onClose: () => void; children: ReactNode }) {
  const { s, isRTL } = useApp();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} animationType="slide" onRequestClose={onClose}>
      {/* A modal is a new root: it needs the app's direction again. */}
      <View style={[styles.sheet, { direction: isRTL ? 'rtl' : 'ltr', paddingTop: insets.top + space.sm, paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <IconButton icon="close" label={s.copyEvent.close} look="dark" onPress={onClose} />
          <Txt variant="sectionTitle" style={styles.flex}>
            {title}
          </Txt>
        </View>
        <Txt variant="caption" color={colors.inkMuted} style={styles.hint}>
          {hint}
        </Txt>
        {children}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  copied: { gap: space.xs, borderColor: colors.primary },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  sheet: { flex: 1, backgroundColor: colors.surfaceAlt },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.md, paddingBottom: space.xs },
  hint: { paddingHorizontal: space.md, paddingBottom: space.sm },
  search: { paddingHorizontal: space.md, paddingBottom: space.sm },
  list: { paddingHorizontal: space.md, paddingBottom: space.lg, gap: space.sm },
  row: {
    minHeight: touch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.input,
    backgroundColor: colors.surface,
  },
  lessonRow: { alignItems: 'flex-start' },
  isIn: { opacity: 0.6 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: space.xs },
  pressed: { opacity: 0.75 },
});

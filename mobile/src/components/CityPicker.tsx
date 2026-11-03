import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApp } from '@/state/app';
import { colors, radius, space, touch } from '@/theme/tokens';
import { cityName, LIBYAN_CITIES } from '../../../shared/cities';
import { Txt } from './Txt';
import { Field, IconButton } from './ui';

/**
 * Picks a city from the list (shared/cities.ts); nobody types one. `value` is
 * the stored (Arabic) name, or '' before a choice.
 */
export function CityPicker({ label, value, onChange, error }: { label: string; value: string; onChange: (city: string) => void; error?: string | null }) {
  const { s, lang, isRTL } = useApp();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const cities = useMemo(() => {
    const q = search.trim().toLowerCase();
    // In Arabic the article ال is not counted, as in a dictionary: البيضاء goes under ب.
    const key = (c: (typeof LIBYAN_CITIES)[number]) => (lang === 'ar' ? c.ar.replace(/^ال/, '') : c.en);
    return [...LIBYAN_CITIES]
      .sort((a, b) => key(a).localeCompare(key(b), lang))
      .filter((c) => !q || c.ar.includes(q) || c.en.toLowerCase().includes(q));
  }, [lang, search]);

  const close = () => {
    setOpen(false);
    setSearch('');
  };

  return (
    <View style={styles.field}>
      <Txt variant="caption" color={colors.inkMuted}>
        {label}
      </Txt>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value ? cityName(value, lang) : s.cityPicker.choose}`}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.box, !!error && styles.boxError, pressed && styles.pressed]}>
        <Txt style={styles.flex} color={value ? colors.ink : colors.inkMuted}>
          {value ? cityName(value, lang) : s.cityPicker.choose}
        </Txt>
        <Ionicons name="chevron-down" size={20} color={colors.inkMuted} />
      </Pressable>
      {!!error && (
        <Txt variant="caption" color={colors.danger} accessibilityLiveRegion="polite">
          {error}
        </Txt>
      )}

      <Modal visible={open} animationType="slide" onRequestClose={close}>
        {/* A modal is a new root: it needs the app's direction again. */}
        <View style={[styles.sheet, { direction: isRTL ? 'rtl' : 'ltr', paddingTop: insets.top + space.sm }]}>
          <View style={styles.header}>
            <IconButton icon="close" label={s.cityPicker.close} look="dark" onPress={close} />
            <Txt variant="sectionTitle" style={styles.flex}>
              {s.cityPicker.title}
            </Txt>
          </View>
          <View style={styles.search}>
            <Field label={s.cityPicker.search} value={search} onChangeText={setSearch} autoCorrect={false} />
          </View>
          <FlatList
            data={cities}
            keyExtractor={(c) => c.ar}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: space.md, paddingBottom: insets.bottom + space.lg }}
            ListEmptyComponent={
              <Txt color={colors.inkMuted} style={styles.empty}>
                {s.cityPicker.none}
              </Txt>
            }
            renderItem={({ item }) => {
              const chosen = item.ar === value;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: chosen }}
                  onPress={() => {
                    onChange(item.ar);
                    close();
                  }}
                  style={({ pressed }) => [styles.row, chosen && styles.rowChosen, pressed && styles.pressed]}>
                  <Txt variant={chosen ? 'bodyStrong' : 'body'} style={styles.flex}>
                    {item[lang]}
                  </Txt>
                  {chosen && <Ionicons name="checkmark" size={22} color={colors.primary} />}
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: space.xs },
  flex: { flex: 1 },
  box: {
    minHeight: touch,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.surface,
    backgroundColor: colors.surface,
    paddingHorizontal: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  boxError: { borderColor: colors.danger },
  pressed: { opacity: 0.75 },
  sheet: { flex: 1, backgroundColor: colors.surfaceAlt },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.md, paddingBottom: space.sm },
  search: { paddingHorizontal: space.md, paddingBottom: space.sm },
  row: {
    minHeight: touch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.input,
  },
  rowChosen: { backgroundColor: colors.accentSoft },
  empty: { padding: space.md },
});

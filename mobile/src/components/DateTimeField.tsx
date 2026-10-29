import { Ionicons } from '@expo/vector-icons';
import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { day, time } from '@/i18n/format';
import { useApp } from '@/state/app';
import { colors, radius, space, touch } from '@/theme/tokens';
import { Txt } from './Txt';

interface Props {
  label: string;
  value: Date;
  onChange(next: Date): void;
  minimumDate?: Date;
}

/** Keeps `current` and takes either the day or the time of day from `picked`. */
function merge(current: Date, picked: Date, part: 'date' | 'time') {
  const next = new Date(current);
  if (part === 'date') next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
  else next.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
  return next;
}

/**
 * A day and a time, picked with the phone's own pickers (@expo/ui, in Expo Go).
 * Android: two buttons that open the system's date and time dialogs.
 * iOS: the system's compact pickers, shown in place.
 * The web has its own file (DateTimeField.web.tsx).
 */
export function DateTimeField({ label, value, onChange, minimumDate }: Props) {
  const { s, now } = useApp();
  const [picking, setPicking] = useState<'date' | 'time' | null>(null);

  if (Platform.OS === 'ios') {
    return (
      <View style={styles.field}>
        <Txt variant="caption" color={colors.inkMuted}>
          {label}
        </Txt>
        <View style={styles.row}>
          <DateTimePicker value={value} mode="date" display="compact" minimumDate={minimumDate} accentColor={colors.primary} onValueChange={(_, d) => onChange(merge(value, d, 'date'))} />
          <DateTimePicker value={value} mode="time" display="compact" accentColor={colors.primary} onValueChange={(_, d) => onChange(merge(value, d, 'time'))} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.field}>
      <Txt variant="caption" color={colors.inkMuted}>
        {label}
      </Txt>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${day(value.getTime(), s, now)}`}
          onPress={() => setPicking('date')}
          style={({ pressed }) => [styles.box, styles.flex, pressed && styles.pressed]}>
          <Ionicons name="calendar-outline" size={20} color={colors.primary} />
          <Txt>{day(value.getTime(), s, now)}</Txt>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${time(value.getTime(), s)}`}
          onPress={() => setPicking('time')}
          style={({ pressed }) => [styles.box, pressed && styles.pressed]}>
          <Ionicons name="time-outline" size={20} color={colors.primary} />
          <Txt tabular>{time(value.getTime(), s)}</Txt>
        </Pressable>
      </View>
      {picking && (
        <DateTimePicker
          value={value}
          mode={picking}
          presentation="dialog"
          minimumDate={picking === 'date' ? minimumDate : undefined}
          accentColor={colors.primary}
          onValueChange={(_, d) => {
            setPicking(null);
            onChange(merge(value, d, picking));
          }}
          onDismiss={() => setPicking(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: space.xs },
  row: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  flex: { flex: 1 },
  box: {
    minHeight: touch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pressed: { backgroundColor: colors.primarySoft },
});

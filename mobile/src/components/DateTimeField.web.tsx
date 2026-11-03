// The web build (for trying the app in a browser): the browser's own date and
// time inputs, since the phone pickers in DateTimeField.tsx draw nothing there.

import { StyleSheet, View } from 'react-native';

import { colors, fonts, radius, space, touch } from '@/theme/tokens';
import { Txt } from './Txt';

interface Props {
  label: string;
  value: Date;
  onChange(next: Date): void;
  minimumDate?: Date;
}

const pad = (n: number) => String(n).padStart(2, '0');
const dateText = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeText = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

const input = {
  minHeight: touch,
  padding: `0 ${space.md}px`,
  borderRadius: radius.input,
  border: `1px solid ${colors.border}`,
  fontFamily: fonts.plex400,
  fontSize: 16,
  color: colors.ink,
  background: colors.surface,
} as const;

export function DateTimeField({ label, value, onChange, minimumDate }: Props) {
  const set = (part: 'date' | 'time', text: string) => {
    if (!text) return;
    const next = new Date(value);
    const [a, b, c] = text.split(/[-:]/).map(Number);
    if (part === 'date') next.setFullYear(a, b - 1, c);
    else next.setHours(a, b, 0, 0);
    onChange(next);
  };
  return (
    <View style={styles.field}>
      <Txt variant="caption" color={colors.inkMuted}>
        {label}
      </Txt>
      <View style={styles.row}>
        <input
          type="date"
          aria-label={label}
          value={dateText(value)}
          min={minimumDate ? dateText(minimumDate) : undefined}
          onChange={(e) => set('date', e.target.value)}
          style={{ ...input, flex: 1 }}
        />
        <input type="time" aria-label={label} value={timeText(value)} onChange={(e) => set('time', e.target.value)} style={input} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: space.xs },
  row: { flexDirection: 'row', gap: space.sm },
});

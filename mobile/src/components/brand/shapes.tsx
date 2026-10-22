import { StyleSheet, View } from 'react-native';

// A "+" made of two rounded bars — the points glyph in the motion graphics.
export function Plus({ size, color }: { size: number; color: string }) {
  const bar = size * 0.28;
  return (
    <View style={{ width: size, height: size }}>
      <View style={[styles.abs, { left: 0, top: (size - bar) / 2, width: size, height: bar, borderRadius: bar, backgroundColor: color }]} />
      <View style={[styles.abs, { top: 0, left: (size - bar) / 2, width: bar, height: size, borderRadius: bar, backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
});

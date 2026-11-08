import { Ionicons } from '@expo/vector-icons';
import { Image, type ImageSource } from 'expo-image';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Txt } from '@/components/Txt';
import { useApp } from '@/state/app';
import { space, touch } from '@/theme/tokens';

const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;

/**
 * A lesson's picture on the whole screen, to read a dense infographic: pinch
 * to zoom, drag to move around once zoomed in, double-tap to zoom in or back
 * out. Its own gesture root, since a modal sits outside the app's.
 */
export function PictureViewer({ source, label, onClose }: { source: ImageSource; label: string; onClose: () => void }) {
  const { s } = useApp();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent supportedOrientations={['portrait', 'landscape']}>
      <GestureHandlerRootView style={styles.root}>
        <Zoomable>
          <Image source={source} style={styles.image} contentFit="contain" accessibilityLabel={label} accessibilityIgnoresInvertColors />
        </Zoomable>
        <View style={[styles.bar, { paddingTop: insets.top + space.sm }]} pointerEvents="box-none">
          <Pressable accessibilityRole="button" accessibilityLabel={s.learn.closePicture} onPress={onClose} style={styles.close} hitSlop={8}>
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>
        </View>
        <View style={[styles.hint, { paddingBottom: insets.bottom + space.md }]} pointerEvents="none">
          <View style={styles.hintPill}>
            <Txt variant="caption" color="#fff" align="center">
              {s.learn.zoomHint}
            </Txt>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

function Zoomable({ children }: { children: React.ReactNode }) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);

  const reset = () => {
    'worklet';
    scale.value = withTiming(1);
    x.value = withTiming(0);
    y.value = withTiming(0);
    savedScale.value = 1;
    savedX.value = 0;
    savedY.value = 0;
  };

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.min(MAX_SCALE, Math.max(1, savedScale.value * e.scale));
    })
    .onEnd(() => {
      if (scale.value <= 1.02) reset();
      else savedScale.value = scale.value;
    });
  // Moving only means something once zoomed in.
  const pan = Gesture.Pan()
    .averageTouches(true)
    .onUpdate((e) => {
      if (scale.value <= 1) return;
      x.value = savedX.value + e.translationX;
      y.value = savedY.value + e.translationY;
    })
    .onEnd(() => {
      savedX.value = x.value;
      savedY.value = y.value;
    });
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) reset();
      else {
        scale.value = withTiming(DOUBLE_TAP_SCALE);
        savedScale.value = DOUBLE_TAP_SCALE;
      }
    });

  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }] }));
  return (
    <GestureDetector gesture={Gesture.Simultaneous(pinch, pan, doubleTap)}>
      <Animated.View style={[styles.fill, style]}>{children}</Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  fill: { flex: 1 },
  image: { flex: 1, width: '100%' },
  bar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: space.md },
  close: {
    width: touch,
    height: touch,
    borderRadius: touch / 2,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // On a dark pill, so it reads over a light picture too.
  hint: { position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center', paddingHorizontal: space.lg },
  hintPill: { backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 999, paddingHorizontal: space.md, paddingVertical: space.xs },
});

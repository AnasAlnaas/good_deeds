import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  AnimatedLogo,
  ConfirmedMotion,
  JoinedMotion,
  Logo,
  LogoMark,
  OnboardingArt,
  RecordedMotion,
} from '@/components/brand';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { colors, radius, space } from '@/theme/tokens';

// Dev gallery for the logo, the onboarding and the success motion graphics.
// Open /brand (web) or gooddeeds://brand. No screen links here; it is for previewing.
export default function BrandGallery() {
  const [run, setRun] = useState(0);
  const replay = () => setRun(run + 1);

  return (
    <Screen title="Brand" back footer={<Button label="Replay" onPress={replay} />}>
      <Txt variant="sectionTitle">Mark</Txt>
      <View style={styles.row}>
        <LogoMark size={72} />
        <View style={[styles.tile, { backgroundColor: colors.primary }]}>
          <LogoMark size={56} />
        </View>
        <View style={[styles.tile, { backgroundColor: colors.brandGreen }]}>
          <LogoMark size={56} variant="reverse" />
        </View>
        <LogoMark size={56} variant="mono" color={colors.primary} />
        <LogoMark size={24} />
      </View>

      <Txt variant="sectionTitle">Lockup</Txt>
      <Logo size={44} />
      <View style={[styles.tile, styles.wide, { backgroundColor: colors.primary }]}>
        <Logo size={56} layout="stack" color={colors.surface} />
      </View>

      <Txt variant="sectionTitle">Intro</Txt>
      <View style={styles.stage}>
        <AnimatedLogo key={`logo-${run}`} size={140} />
      </View>

      <Txt variant="sectionTitle">Success</Txt>
      <View style={[styles.stage, styles.row, styles.spread]}>
        <Labeled label="Joined">
          <JoinedMotion key={`joined-${run}`} size={150} />
        </Labeled>
        <Labeled label="Recorded · start">
          <RecordedMotion key={`rs-${run}`} size={150} mode="start" />
        </Labeled>
        <Labeled label="Recorded · end">
          <RecordedMotion key={`re-${run}`} size={150} mode="end" />
        </Labeled>
        <Labeled label="Confirmed">
          <ConfirmedMotion key={`conf-${run}`} size={150} values={{ spiritual: 2, mental: 1, physical: 3 }} />
        </Labeled>
      </View>

      {[0, 1, 2].map((i) => (
        <View key={i} style={{ gap: space.sm }}>
          <Txt variant="sectionTitle">Onboarding {i + 1}</Txt>
          <View style={styles.stage}>
            <OnboardingArt key={`${i}-${run}`} index={i} size={280} />
          </View>
        </View>
      ))}
    </Screen>
  );
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.labeled}>
      {children}
      <Txt variant="caption" color={colors.inkMuted}>
        {label}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, flexWrap: 'wrap' },
  spread: { justifyContent: 'center' },
  labeled: { alignItems: 'center', gap: space.xs },
  tile: { padding: space.sm, borderRadius: radius.card },
  wide: { alignItems: 'center', paddingVertical: space.lg },
  stage: { alignItems: 'center', paddingVertical: space.md, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border },
});

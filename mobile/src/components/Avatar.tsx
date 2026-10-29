import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { PublicUser } from '@/data/api';
import { useApp } from '@/state/app';
import { colors, fonts } from '@/theme/tokens';
import { Txt } from './Txt';

/**
 * A person's photo, or the first letter of their name when there is none, it
 * failed to load, or the viewer may not see it (the server then sends no address).
 */
export function Avatar({ user, size = 40 }: { user: Pick<PublicUser, 'full_name' | 'avatar_url'>; size?: number }) {
  const { photoSource } = useApp();
  const source = photoSource(user.avatar_url);
  const [failed, setFailed] = useState<string | null>(null);
  const round = { width: size, height: size, borderRadius: size / 2 };

  if (source && failed !== source.uri) {
    return (
      <Image
        source={source}
        style={[round, styles.photo]}
        contentFit="cover"
        transition={150}
        onError={() => setFailed(source.uri)}
        accessibilityIgnoresInvertColors
      />
    );
  }
  return (
    <View style={[round, styles.initial]}>
      <Txt align="center" color={colors.primary} style={{ fontFamily: fonts.readex700, fontSize: size * 0.42, lineHeight: size * 0.62 }}>
        {user.full_name.charAt(0)}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  photo: { backgroundColor: colors.primarySoft },
  initial: { backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
});

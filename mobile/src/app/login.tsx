import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Badge, Card } from '@/components/ui';
import { DEMO_ACCOUNTS } from '@/demo/seed';
import { useApp } from '@/state/app';
import { colors, space } from '@/theme/tokens';

export default function Login() {
  const { s, db, lang, setLang, signIn } = useApp();

  const accounts = [
    { id: DEMO_ACCOUNTS.participant, role: s.login.participant, hint: s.login.participantHint, icon: 'person' as const },
    { id: DEMO_ACCOUNTS.participantFemale, role: s.login.participantFemale, hint: s.login.participantHintFemale, icon: 'person' as const },
    { id: DEMO_ACCOUNTS.supervisor, role: s.login.supervisor, hint: s.login.supervisorHint, icon: 'clipboard' as const },
    { id: DEMO_ACCOUNTS.supervisorFemale, role: s.login.supervisorFemale, hint: s.login.supervisorHintFemale, icon: 'clipboard' as const },
  ];

  const choose = (id: string) => {
    signIn(id);
    router.replace('/map');
  };

  return (
    <Screen>
      <View style={styles.top}>
        <Badge label={s.demoBadge} color={colors.warning} icon="flask" />
        <View style={styles.lang}>
          <Button variant="quiet" icon="language" label={s.login.language} onPress={() => setLang(lang === 'ar' ? 'en' : 'ar')} />
        </View>
      </View>
      <Txt variant="screenTitle">{s.appName}</Txt>
      <Txt variant="caption" color={colors.inkMuted}>
        {s.association}
      </Txt>
      <Txt variant="sectionTitle" style={styles.gap}>
        {s.login.title}
      </Txt>
      <Txt color={colors.inkMuted}>{s.login.body}</Txt>
      {accounts.map((a) => {
        const u = db.users.find((x) => x.id === a.id);
        if (!u) return null;
        return (
          <Card key={a.id} onPress={() => choose(a.id)}>
            <View style={styles.row}>
              <View style={styles.icon}>
                <Ionicons name={a.icon} size={24} color={colors.primary} />
              </View>
              <View style={styles.flex}>
                <Txt variant="bodyStrong">{u.full_name}</Txt>
                <Txt variant="caption" color={colors.inkMuted}>
                  {a.role} · {a.hint}
                </Txt>
              </View>
            </View>
          </Card>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  lang: { minWidth: 120 },
  gap: { marginTop: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  icon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
});

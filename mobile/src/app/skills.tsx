import { useState } from 'react';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Chip, QueryState, Row, SectionTitle } from '@/components/ui';
import { useMySkills } from '@/data/queries';
import { fmt, num } from '@/i18n/format';
import * as dialog from '@/lib/dialog';
import { useApp } from '@/state/app';
import { useAction } from '@/state/useAction';
import { classIcon, className, EVENT_CLASSES, type EventClassId } from '@/theme/classes';
import { colors } from '@/theme/tokens';
import { MAX_SKILLS_PER_PERSON } from '../../../shared/skills';

// Owner's decisions (2026-11-20): what a volunteer can do (from the
// association's list) and the classes of good works they like, for suggesting
// events; seen only by them and the admins.
export default function MySkillsScreen() {
  const { s, lang } = useApp();
  const query = useMySkills();
  const { run, busy } = useAction();
  const [skills, setSkills] = useState<string[] | null>(null);
  const [classes, setClasses] = useState<EventClassId[] | null>(null);

  if (!query.data) {
    return (
      <Screen back title={s.skills.title}>
        <QueryState query={query} />
      </Screen>
    );
  }

  const chosen = skills ?? query.data.skill_ids;
  const liked = classes ?? query.data.classes;
  const toggleSkill = (id: string) =>
    setSkills(chosen.includes(id) ? chosen.filter((x) => x !== id) : chosen.length < MAX_SKILLS_PER_PERSON ? [...chosen, id] : chosen);
  const toggleClass = (id: EventClassId) => setClasses(liked.includes(id) ? liked.filter((x) => x !== id) : [...liked, id]);
  const changed = skills !== null || classes !== null;
  const save = async () => {
    if (await run((b) => b.setMySkills({ skill_ids: chosen, classes: liked }))) {
      setSkills(null);
      setClasses(null);
      dialog.notify(s.skills.title, s.skills.saved);
    }
  };

  return (
    <Screen back title={s.skills.title} footer={<Button icon="checkmark" label={s.skills.save} disabled={!changed || busy} onPress={save} />}>
      <Txt color={colors.inkMuted}>{s.skills.intro}</Txt>

      <SectionTitle>{s.skills.skillsTitle}</SectionTitle>
      <Txt variant="caption" color={colors.inkMuted}>
        {fmt(s.skills.max, { n: num(MAX_SKILLS_PER_PERSON) })}
      </Txt>
      <Row>
        {query.data.offered.map((x) => (
          <Chip key={x.id} label={lang === 'ar' ? x.name_ar : x.name_en} selected={chosen.includes(x.id)} onPress={() => toggleSkill(x.id)} />
        ))}
      </Row>

      <SectionTitle>{s.skills.classesTitle}</SectionTitle>
      <Row>
        {EVENT_CLASSES.map((c) => (
          <Chip key={c.id} icon={classIcon(c.id)} label={className(c.id, lang)} selected={liked.includes(c.id)} onPress={() => toggleClass(c.id)} />
        ))}
      </Row>
    </Screen>
  );
}

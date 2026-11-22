import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import type { AdminSkillRow } from '../../../shared/api';
import { api } from '../api';
import { num } from '../format';
import { t } from '../strings';
import { Button, ErrorNote, PageHeader, QueryState, useAction } from '../ui';

/**
 * Owner's decisions (2026-11-20): the skills volunteers choose and events
 * name. Admins add to the list, rename, hide (no longer offered; those who
 * chose it keep it) or offer one again. Who has which skill is private.
 */
export function Skills() {
  const query = useQuery({ queryKey: ['skills'], queryFn: api.skills });
  const { run, busy, error } = useAction();
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');

  const add = async () => {
    if (await run(() => api.addSkill(nameAr.trim(), nameEn.trim()))) {
      setNameAr('');
      setNameEn('');
    }
  };
  const rename = (x: AdminSkillRow) => {
    const ar = window.prompt(t.skills.renameAr, x.name_ar);
    if (ar === null) return;
    const en = window.prompt(t.skills.renameEn, x.name_en);
    if (en === null) return;
    void run(() => api.editSkill(x.id, { name_ar: ar, name_en: en }));
  };

  // The words that suggest it on the event form (shared/smart.ts skillsInText).
  const editKeywords = (x: AdminSkillRow) => {
    const words = window.prompt(t.skills.keywordsEdit, (x.keywords ?? []).join('، '));
    if (words === null) return;
    void run(() => api.editSkill(x.id, { keywords: words }));
  };

  return (
    <>
      <PageHeader title={t.skills.title} body={t.skills.body} />
      <ErrorNote code={error} />
      <form
        className="actions"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}>
        <input style={{ maxWidth: 260 }} placeholder={t.skills.nameAr} value={nameAr} maxLength={60} onChange={(e) => setNameAr(e.target.value)} />
        <input style={{ maxWidth: 260 }} placeholder={t.skills.nameEn} value={nameEn} maxLength={60} dir="ltr" onChange={(e) => setNameEn(e.target.value)} />
        <Button type="submit" disabled={busy || nameAr.trim().length < 2}>
          {t.skills.add}
        </Button>
      </form>
      {!query.data ? (
        <QueryState query={query} />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t.skills.name}</th>
                <th>{t.skills.people}</th>
                <th>{t.skills.events}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {query.data.map((x) => (
                <tr key={x.id} className={x.is_active ? undefined : 'muted'}>
                  <td>
                    <strong>{x.name_ar}</strong>
                    <div className="muted" dir="ltr">
                      {x.name_en}
                    </div>
                    {!x.is_active && <div className="muted">{t.skills.hidden}</div>}
                    <div className="muted">{x.keywords?.length ? `${t.skills.keywords}: ${x.keywords.join('، ')}` : t.skills.noKeywords}</div>
                  </td>
                  <td>{num(x.people)}</td>
                  <td>{num(x.events)}</td>
                  <td>
                    <div className="actions">
                      <Button variant="secondary" disabled={busy} onClick={() => rename(x)}>
                        {t.skills.rename}
                      </Button>
                      <Button variant="secondary" disabled={busy} onClick={() => editKeywords(x)}>
                        {t.skills.keywordsChange}
                      </Button>
                      <Button variant="secondary" disabled={busy} onClick={() => void run(() => api.editSkill(x.id, { is_active: !x.is_active }))}>
                        {x.is_active ? t.skills.hide : t.skills.offer}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

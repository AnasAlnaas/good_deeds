import { Linking } from 'react-native';

import { CONTACT_EMAIL } from '@/data/config';
import { fmt } from '@/i18n/format';
import type { Strings } from '@/i18n/strings';
import * as dialog from './dialog';

/** Whether this build knows where to write to the association (EXPO_PUBLIC_CONTACT_EMAIL). */
export const canContact = !!CONTACT_EMAIL;

/**
 * Opens an email to the association's admins in the phone's mail app. With no
 * mail app, the address is shown instead, so the person can still write.
 */
export function contactAssociation(s: Strings, subject: string, body = '') {
  if (!CONTACT_EMAIL) return;
  const query = [`subject=${encodeURIComponent(subject)}`, body && `body=${encodeURIComponent(body)}`].filter(Boolean).join('&');
  Linking.openURL(`mailto:${CONTACT_EMAIL}?${query}`).catch(() =>
    dialog.notify(s.next.contact, fmt(s.next.contactCantOpen, { email: CONTACT_EMAIL })),
  );
}

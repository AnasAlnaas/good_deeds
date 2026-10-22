// Sending push notifications through Expo's push service, which forwards them
// to Apple and Google. No credentials are needed unless "enhanced push
// security" is turned on in the EAS dashboard; then set EXPO_ACCESS_TOKEN.
// Docs: https://docs.expo.dev/push-notifications/sending-notifications/

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  /** Read by the app when the notification is tapped (e.g. which record to open). */
  data: Record<string, string>;
}

/** Per message, in order: sent, or the phone no longer accepts notifications (delete its token), or another failure. */
export type PushResult = 'ok' | 'device_not_registered' | 'error';

export type SendPush = (messages: PushMessage[]) => Promise<PushResult[]>;

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH = 100; // Expo's limit per request

export function expoPush(accessToken?: string): SendPush {
  return async (messages) => {
    const results: PushResult[] = [];
    for (let i = 0; i < messages.length; i += BATCH) {
      const batch = messages.slice(i, i + BATCH).map((m) => ({ ...m, sound: 'default' }));
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(batch),
      });
      if (!res.ok) throw new Error(`Expo push refused the request: ${res.status} ${await res.text()}`);
      const tickets = ((await res.json()) as { data: { status: string; details?: { error?: string } }[] }).data;
      for (const t of tickets) {
        results.push(t.status === 'ok' ? 'ok' : t.details?.error === 'DeviceNotRegistered' ? 'device_not_registered' : 'error');
      }
    }
    return results;
  };
}

/** Development: prints what would be sent. */
export const consolePush: SendPush = async (messages) => {
  for (const m of messages) console.log(`[push] ${m.to}: ${m.title} — ${m.body}`);
  return messages.map(() => 'ok');
};

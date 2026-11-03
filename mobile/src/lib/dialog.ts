// Messages and "are you sure?" questions, as the phone shows them. The web
// build has its own (dialog.web.ts), since Alert.alert shows nothing in a browser.

import { Alert } from 'react-native';

interface ConfirmOptions {
  title: string;
  message: string;
  /** The two buttons: the one that changes nothing, and the one that says what will happen. */
  cancel: string;
  action: string;
  /** The action deletes or undoes something (shown in red). */
  destructive?: boolean;
  onConfirm(): void;
}

/** A message with one button that closes it. */
export function notify(title: string, message?: string) {
  Alert.alert(title, message);
}

/** Asks before a change; `onConfirm` runs only if the person chose the action. */
export function confirm({ title, message, cancel, action, destructive, onConfirm }: ConfirmOptions) {
  Alert.alert(title, message, [
    { text: cancel, style: 'cancel' },
    { text: action, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
  ]);
}

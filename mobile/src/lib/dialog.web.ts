// The web build (for trying the app in a browser): the browser's own dialogs,
// since Alert.alert in dialog.ts shows nothing there. Their buttons are the
// browser's (OK / Cancel, in the browser's language); the words are the app's.

interface ConfirmOptions {
  title: string;
  message: string;
  cancel: string;
  action: string;
  destructive?: boolean;
  onConfirm(): void;
}

const text = (title: string, message?: string) => (message ? `${title}\n\n${message}` : title);

export function notify(title: string, message?: string) {
  window.alert(text(title, message));
}

export function confirm({ title, message, onConfirm }: ConfirmOptions) {
  if (window.confirm(text(title, message))) onConfirm();
}

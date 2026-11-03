import { type Href, router } from 'expo-router';

/** Back to where the person came from. A screen opened from a link or a notification has nothing behind it, so it goes to `fallback`. */
export function goBack(fallback: Href) {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}

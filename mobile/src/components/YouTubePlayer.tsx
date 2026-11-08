import { Linking } from 'react-native';
import { WebView } from 'react-native-webview';

// A lesson's YouTube video, playing in the lesson (the web has its own,
// YouTubePlayer.web.tsx). YouTube's privacy-enhanced player, inside a page
// whose address is YouTube's, as YouTube asks of an app's embedded player.
// Anything the player links to (its title, "Watch on YouTube") opens in
// YouTube or the browser, never inside the lesson.

const embedUrl = (videoId: string) => `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&playsinline=1&rel=0`;

const page = (videoId: string) => `<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}iframe{border:0;width:100%;height:100%}</style>
</head><body>
<iframe src="${embedUrl(videoId)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>
</body></html>`;

const PLAYER = /^(about:|https:\/\/(www\.)?youtube(-nocookie)?\.com\/(embed\/|$|\?))/;

export function YouTubePlayer({ videoId, title }: { videoId: string; title: string }) {
  return (
    <WebView
      source={{ html: page(videoId), baseUrl: 'https://www.youtube.com' }}
      accessibilityLabel={title}
      style={{ flex: 1, backgroundColor: '#000' }}
      allowsInlineMediaPlayback
      allowsFullscreenVideo
      mediaPlaybackRequiresUserAction={false}
      originWhitelist={['https://*', 'about:*']}
      setSupportMultipleWindows={false}
      onShouldStartLoadWithRequest={(req) => {
        if (PLAYER.test(req.url) || !req.isTopFrame) return true;
        Linking.openURL(req.url).catch(() => {});
        return false;
      }}
    />
  );
}

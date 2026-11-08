// A lesson's YouTube video on the web: YouTube's privacy-enhanced player in an
// iframe, since react-native-webview has no web version.

const embedUrl = (videoId: string) => `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&playsinline=1&rel=0`;

export function YouTubePlayer({ videoId, title }: { videoId: string; title: string }) {
  return (
    <iframe
      title={title}
      src={embedUrl(videoId)}
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
      style={{ border: 0, width: '100%', height: '100%' }}
    />
  );
}

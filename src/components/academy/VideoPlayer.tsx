import React from 'react';
import type { VideoProvider } from '../../academy/types';

type VideoPlayerProps = {
  provider: VideoProvider | null;
  videoId?: string | null;
  videoUrl?: string | null;
  title: string;
  onProgress?: (progressSeconds: number, durationSeconds: number | null) => void;
  onComplete?: () => void;
};

function getYouTubeEmbedUrl(videoId?: string | null) {
  if (!videoId) return null;
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}`;
}

function getVimeoEmbedUrl(videoId?: string | null) {
  if (!videoId) return null;
  return `https://player.vimeo.com/video/${encodeURIComponent(videoId)}`;
}

function getProviderLabel(provider: VideoProvider | null) {
  switch (provider) {
    case 'youtube':
      return 'YouTube';
    case 'cloudflare_stream':
      return 'Cloudflare Stream';
    case 'mux':
      return 'Mux';
    case 'vimeo':
      return 'Vimeo';
    case 'local':
      return 'Local video';
    case 'supabase':
      return 'Supabase Storage';
    default:
      return 'Video';
  }
}

export function VideoPlayer({
  provider,
  videoId,
  videoUrl,
  title,
  onProgress,
  onComplete,
}: VideoPlayerProps) {
  const progressTimer = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (progressTimer.current) {
        window.clearInterval(progressTimer.current);
      }
    };
  }, []);

  const handleProgress = React.useCallback(
    (video: HTMLVideoElement) => {
      onProgress?.(video.currentTime, Number.isFinite(video.duration) ? video.duration : null);

      if (Number.isFinite(video.duration) && video.duration > 0) {
        const progressPercent = (video.currentTime / video.duration) * 100;
        if (progressPercent >= 90) {
          onComplete?.();
        }
      }
    },
    [onComplete, onProgress],
  );

  if (provider === 'youtube') {
    const embedUrl = getYouTubeEmbedUrl(videoId);

    return (
      <div className="academy-video-frame">
        {embedUrl ? (
          <iframe
            title={title}
            src={embedUrl}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        ) : (
          <VideoUnavailable provider={provider} />
        )}
      </div>
    );
  }

  if (provider === 'vimeo') {
    const embedUrl = getVimeoEmbedUrl(videoId);

    return (
      <div className="academy-video-frame">
        {embedUrl ? (
          <iframe
            title={title}
            src={embedUrl}
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <VideoUnavailable provider={provider} />
        )}
      </div>
    );
  }

  if (provider === 'local' || provider === 'supabase') {
    return (
      <div className="academy-video-frame">
        {videoUrl ? (
          <video
            controls
            preload="metadata"
            title={title}
            src={videoUrl}
            onPlay={(event) => {
              const video = event.currentTarget;
              if (progressTimer.current) window.clearInterval(progressTimer.current);
              progressTimer.current = window.setInterval(() => {
                handleProgress(video);
              }, 10000);
            }}
            onPause={(event) => handleProgress(event.currentTarget)}
            onEnded={(event) => {
              handleProgress(event.currentTarget);
              onComplete?.();
            }}
            onTimeUpdate={(event) => {
              const current = event.currentTarget.currentTime;
              if (Math.floor(current) % 15 === 0) {
                handleProgress(event.currentTarget);
              }
            }}
          />
        ) : (
          <VideoUnavailable provider={provider} />
        )}
      </div>
    );
  }

  return (
    <div className="academy-video-frame academy-video-placeholder">
      <div>
        <span>{getProviderLabel(provider)}</span>
        <strong>{title}</strong>
        <p>Player integration prepared for this provider.</p>
      </div>
    </div>
  );
}

function VideoUnavailable({ provider }: { provider: VideoProvider | null }) {
  return (
    <div className="academy-video-placeholder">
      <div>
        <span>{getProviderLabel(provider)}</span>
        <strong>Video unavailable</strong>
        <p>This lesson has video metadata, but no playable source yet.</p>
      </div>
    </div>
  );
}

import React from 'react';
import type { VideoProvider } from '../../academy/types';
import { fetchR2Playback } from '../../academy/r2VideoApi';

type VideoPlayerProps = {
  provider: VideoProvider | null;
  videoId?: string | null;
  videoUrl?: string | null;
  title: string;
  recordingId?: string;
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
    case 'cloudflare_r2':
      return 'Cloudflare R2';
    case 'mux':
      return 'Mux';
    case 'vimeo':
      return 'Vimeo';
    case 'sharepoint':
      return 'SharePoint / OneDrive';
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
  recordingId,
  onProgress,
  onComplete,
}: VideoPlayerProps) {
  const progressTimer = React.useRef<number | null>(null);
  const [sharePointPlaybackError, setSharePointPlaybackError] = React.useState(false);
  const [r2Playback, setR2Playback] = React.useState<{ url: string; expiresAt: string } | null>(null);
  const [r2PlaybackState, setR2PlaybackState] = React.useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [r2PlaybackMessage, setR2PlaybackMessage] = React.useState('');

  React.useEffect(() => {
    return () => {
      if (progressTimer.current) {
        window.clearInterval(progressTimer.current);
      }
    };
  }, []);

  React.useEffect(() => {
    setSharePointPlaybackError(false);
  }, [provider, videoUrl]);

  const loadR2Playback = React.useCallback(async () => {
    if (provider !== 'cloudflare_r2' || !recordingId) return;
    setR2PlaybackState('loading');
    setR2PlaybackMessage('');
    try {
      const playback = await fetchR2Playback(recordingId);
      setR2Playback({ url: playback.playbackUrl, expiresAt: playback.expiresAt });
      setR2PlaybackState('ready');
    } catch (caught) {
      setR2Playback(null);
      setR2PlaybackState('error');
      setR2PlaybackMessage(caught instanceof Error ? caught.message : 'Private video playback is unavailable.');
    }
  }, [provider, recordingId]);

  React.useEffect(() => {
    if (provider !== 'cloudflare_r2' || !recordingId) return;
    void loadR2Playback();
  }, [loadR2Playback, provider, recordingId]);

  React.useEffect(() => {
    if (!r2Playback) return;
    const refreshIn = Math.max(new Date(r2Playback.expiresAt).getTime() - Date.now() - 5 * 60 * 1000, 30_000);
    const timer = window.setTimeout(() => void loadR2Playback(), refreshIn);
    return () => window.clearTimeout(timer);
  }, [loadR2Playback, r2Playback]);

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

  if (provider === 'cloudflare_r2') {
    if (r2PlaybackState === 'loading' || r2PlaybackState === 'idle') {
      return <VideoStatus provider={provider} title="Preparing private video..." detail="Requesting secure temporary playback access." />;
    }
    if (!r2Playback || r2PlaybackState === 'error') {
      return (
        <div className="academy-video-frame academy-video-placeholder">
          <div>
            <span>{getProviderLabel(provider)}</span>
            <strong>Playback unavailable</strong>
            <p>{r2PlaybackMessage || 'The private video could not be loaded.'}</p>
            <button type="button" onClick={() => void loadR2Playback()}>Retry playback</button>
          </div>
        </div>
      );
    }
    return (
      <div className="academy-video-frame">
        <video
          controls
          controlsList="nodownload noplaybackrate noremoteplayback"
          disablePictureInPicture
          disableRemotePlayback
          playsInline
          preload="metadata"
          title={title}
          src={r2Playback.url}
          onContextMenu={(event) => event.preventDefault()}
          onError={() => {
            setR2PlaybackState('error');
            setR2PlaybackMessage('The secure playback URL expired or the video could not be decoded.');
          }}
          onPlay={(event) => {
            const video = event.currentTarget;
            if (progressTimer.current) window.clearInterval(progressTimer.current);
            progressTimer.current = window.setInterval(() => handleProgress(video), 10000);
          }}
          onPause={(event) => handleProgress(event.currentTarget)}
          onEnded={(event) => {
            handleProgress(event.currentTarget);
            onComplete?.();
          }}
        />
      </div>
    );
  }

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

  if (provider === 'sharepoint') {
    let embedUrl: string | null = null;
    let sharedVideoUrl: string | null = null;
    try {
      if (videoUrl) {
        const parsed = new URL(videoUrl);
        const hostname = parsed.hostname.toLowerCase();
        if (
          parsed.protocol === 'https:'
          && (
            hostname === 'onedrive.live.com'
            || hostname.endsWith('.sharepoint.com')
            || hostname.endsWith('.sharepoint-df.com')
          )
        ) {
          if (parsed.pathname.toLowerCase().includes('/embed.aspx')) {
            embedUrl = parsed.toString();
          } else {
            parsed.searchParams.set('download', '1');
            sharedVideoUrl = parsed.toString();
          }
        }
      }
    } catch {
      embedUrl = null;
    }

    return (
      <div className="academy-video-frame">
        {embedUrl ? (
          <iframe
            title={title}
            src={embedUrl}
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : sharedVideoUrl && !sharePointPlaybackError ? (
          <video
            controls
            controlsList="nodownload noplaybackrate noremoteplayback"
            disablePictureInPicture
            disableRemotePlayback
            playsInline
            preload="metadata"
            title={title}
            src={sharedVideoUrl}
            onContextMenu={(event) => event.preventDefault()}
            onError={() => setSharePointPlaybackError(true)}
            onPlay={(event) => {
              const video = event.currentTarget;
              if (progressTimer.current) window.clearInterval(progressTimer.current);
              progressTimer.current = window.setInterval(() => handleProgress(video), 10000);
            }}
            onPause={(event) => handleProgress(event.currentTarget)}
            onEnded={(event) => {
              handleProgress(event.currentTarget);
              onComplete?.();
            }}
          />
        ) : videoUrl && sharePointPlaybackError ? (
          <div className="academy-video-placeholder">
            <div>
              <span>{getProviderLabel(provider)}</span>
              <strong>SharePoint blocked direct playback</strong>
              <p>The anonymous link is valid, but SharePoint did not return a browser-playable video stream.</p>
              <a href={videoUrl} target="_blank" rel="noreferrer">Open recording in SharePoint</a>
            </div>
          </div>
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
            controlsList="nodownload noplaybackrate noremoteplayback"
            disablePictureInPicture
            disableRemotePlayback
            preload="metadata"
            title={title}
            src={videoUrl}
            onContextMenu={(event) => event.preventDefault()}
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

function VideoStatus({ provider, title, detail }: { provider: VideoProvider | null; title: string; detail: string }) {
  return (
    <div className="academy-video-frame academy-video-placeholder">
      <div>
        <span>{getProviderLabel(provider)}</span>
        <strong>{title}</strong>
        <p>{detail}</p>
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

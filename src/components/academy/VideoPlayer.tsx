import React from 'react';
import {
  Maximize,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
} from 'lucide-react';
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
  const r2PlaybackRef = React.useRef(r2Playback);
  const r2RequestRef = React.useRef(0);

  React.useEffect(() => {
    r2PlaybackRef.current = r2Playback;
  }, [r2Playback]);

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
    const requestId = ++r2RequestRef.current;
    // Keep the current video mounted while its signed URL is renewed. Replacing
    // it with the loading placeholder interrupts playback and looks like a flash.
    if (!r2PlaybackRef.current) setR2PlaybackState('loading');
    setR2PlaybackMessage('');
    try {
      const playback = await fetchR2Playback(recordingId);
      if (requestId !== r2RequestRef.current) return;
      setR2Playback({ url: playback.playbackUrl, expiresAt: playback.expiresAt });
      setR2PlaybackState('ready');
    } catch (caught) {
      if (requestId !== r2RequestRef.current) return;
      // A failed proactive renewal must not tear down a URL that is still
      // playing. The media error handler will surface a failure if it expires.
      if (r2PlaybackRef.current) return;
      setR2PlaybackState('error');
      setR2PlaybackMessage(caught instanceof Error ? caught.message : 'Private video playback is unavailable.');
    }
  }, [provider, recordingId]);

  React.useEffect(() => {
    if (provider !== 'cloudflare_r2' || !recordingId) return;
    void loadR2Playback();
    return () => {
      r2RequestRef.current += 1;
    };
  }, [loadR2Playback, provider, recordingId]);

  React.useEffect(() => {
    if (!r2Playback) return;
    const expiresAt = Date.parse(r2Playback.expiresAt);
    const refreshIn = Number.isFinite(expiresAt)
      ? Math.max(expiresAt - Date.now() - 5 * 60 * 1000, 30_000)
      : 60 * 60 * 1000;
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
      <YvimoVideoPlayer
        src={r2Playback.url}
        title={title}
        onError={(mediaError) => {
          setR2PlaybackState('error');
          const detail = mediaError
            ? `MediaError ${mediaError.code}${mediaError.message ? `: ${mediaError.message}` : ''}`
            : 'unknown media error';
          setR2PlaybackMessage(`R2 accepted the signed URL, but the browser rejected the media (${detail}).`);
        }}
        onProgress={handleProgress}
        onComplete={onComplete}
      />
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

function formatVideoTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return '0:00';
  const totalSeconds = Math.floor(value);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function YvimoVideoPlayer({
  src,
  title,
  onError,
  onProgress,
  onComplete,
}: {
  src: string;
  title: string;
  onError: (error: MediaError | null) => void;
  onProgress: (video: HTMLVideoElement) => void;
  onComplete?: () => void;
}) {
  const frameRef = React.useRef<HTMLDivElement>(null);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const progressTimer = React.useRef<number | null>(null);
  const controlsTimer = React.useRef<number | null>(null);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [isMuted, setIsMuted] = React.useState(false);
  const [volume, setVolume] = React.useState(1);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [duration, setDuration] = React.useState(0);
  const [buffered, setBuffered] = React.useState(0);
  const [showControls, setShowControls] = React.useState(true);
  const [playbackMessage, setPlaybackMessage] = React.useState('');
  const [useNativeControls, setUseNativeControls] = React.useState(false);

  const revealControls = React.useCallback(() => {
    setShowControls(true);
    if (controlsTimer.current) window.clearTimeout(controlsTimer.current);
    if (videoRef.current && !videoRef.current.paused) {
      controlsTimer.current = window.setTimeout(() => setShowControls(false), 2600);
    }
  }, []);

  React.useEffect(() => () => {
    if (progressTimer.current) window.clearInterval(progressTimer.current);
    if (controlsTimer.current) window.clearTimeout(controlsTimer.current);
  }, []);

  const startPlayback = React.useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    setPlaybackMessage('');
    try {
      await video.play();
    } catch (caught) {
      const errorName = caught instanceof DOMException
        ? caught.name
        : video.error
          ? `MediaError ${video.error.code}`
          : 'PlaybackError';
      setUseNativeControls(true);
      setPlaybackMessage(
        caught instanceof DOMException && caught.name === 'NotAllowedError'
          ? 'Your browser blocked playback. Allow media playback for www.yvimo.com and try again.'
          : `Chrome could not start this video (${errorName}). Try the browser controls below.`,
      );
    }
  }, []);

  const togglePlayback = React.useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void startPlayback();
    else video.pause();
  }, [startPlayback]);

  const skip = React.useCallback((seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.min(Math.max(video.currentTime + seconds, 0), video.duration || 0);
    setCurrentTime(video.currentTime);
  }, []);

  const toggleMute = React.useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  }, []);

  const toggleFullscreen = React.useCallback(async () => {
    if (!frameRef.current) return;
    if (document.fullscreenElement) await document.exitFullscreen();
    else await frameRef.current.requestFullscreen();
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === ' ' || event.key.toLowerCase() === 'k') {
      event.preventDefault();
      togglePlayback();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      skip(-10);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      skip(10);
    } else if (event.key.toLowerCase() === 'm') {
      event.preventDefault();
      toggleMute();
    } else if (event.key.toLowerCase() === 'f') {
      event.preventDefault();
      void toggleFullscreen();
    }
    revealControls();
  };

  const updateBuffered = (video: HTMLVideoElement) => {
    if (!video.duration || video.buffered.length === 0) {
      setBuffered(0);
      return;
    }
    setBuffered((video.buffered.end(video.buffered.length - 1) / video.duration) * 100);
  };

  const playedPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      ref={frameRef}
      className={`academy-video-frame academy-yvimo-player${showControls ? ' controls-visible' : ''}`}
      tabIndex={0}
      aria-label={`${title} video player`}
      onKeyDown={handleKeyDown}
      onMouseMove={revealControls}
      onMouseLeave={() => isPlaying && setShowControls(false)}
      onClick={(event) => {
        if (event.target === event.currentTarget) togglePlayback();
      }}
    >
      <video
        ref={videoRef}
        controls={useNativeControls}
        disablePictureInPicture
        disableRemotePlayback
        playsInline
        preload="metadata"
        title={title}
        src={src}
        onContextMenu={(event) => event.preventDefault()}
        onClick={useNativeControls ? undefined : togglePlayback}
        onError={(event) => onError(event.currentTarget.error)}
        onLoadedMetadata={(event) => {
          setPlaybackMessage('');
          setDuration(event.currentTarget.duration);
          updateBuffered(event.currentTarget);
        }}
        onDurationChange={(event) => setDuration(event.currentTarget.duration)}
        onProgress={(event) => updateBuffered(event.currentTarget)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onPlay={(event) => {
          const video = event.currentTarget;
          setIsPlaying(true);
          revealControls();
          if (progressTimer.current) window.clearInterval(progressTimer.current);
          progressTimer.current = window.setInterval(() => onProgress(video), 10000);
        }}
        onCanPlay={() => setPlaybackMessage('')}
        onPause={(event) => {
          setIsPlaying(false);
          setShowControls(true);
          onProgress(event.currentTarget);
          if (progressTimer.current) window.clearInterval(progressTimer.current);
        }}
        onEnded={(event) => {
          setIsPlaying(false);
          setShowControls(true);
          onProgress(event.currentTarget);
          onComplete?.();
        }}
      />

      {playbackMessage ? <div className="academy-video-playback-message" role="alert">{playbackMessage}</div> : null}

      {!useNativeControls && !isPlaying && (
        <button className="academy-video-center-play" type="button" onClick={togglePlayback} aria-label="Play video">
          <Play size={32} fill="currentColor" />
        </button>
      )}

      {!useNativeControls ? <div className="academy-video-controls" onClick={(event) => event.stopPropagation()}>
        <div className="academy-video-timeline">
          <div className="academy-video-buffered" style={{ width: `${buffered}%` }} />
          <div className="academy-video-played" style={{ width: `${playedPercent}%` }} />
          <input
            type="range"
            min="0"
            max={duration || 0}
            step="0.1"
            value={Math.min(currentTime, duration || 0)}
            aria-label="Video progress"
            onChange={(event) => {
              const nextTime = Number(event.target.value);
              if (videoRef.current) videoRef.current.currentTime = nextTime;
              setCurrentTime(nextTime);
            }}
          />
        </div>

        <div className="academy-video-control-row">
          <div className="academy-video-control-group">
            <button type="button" onClick={togglePlayback} aria-label={isPlaying ? 'Pause video' : 'Play video'}>
              {isPlaying ? <Pause size={21} fill="currentColor" /> : <Play size={21} fill="currentColor" />}
            </button>
            <button type="button" onClick={() => skip(-10)} aria-label="Go back 10 seconds">
              <RotateCcw size={20} />
              <small>10</small>
            </button>
            <button type="button" onClick={() => skip(10)} aria-label="Go forward 10 seconds">
              <RotateCw size={20} />
              <small>10</small>
            </button>
            <div className="academy-video-volume">
              <button type="button" onClick={toggleMute} aria-label={isMuted ? 'Unmute video' : 'Mute video'}>
                {isMuted || volume === 0 ? <VolumeX size={21} /> : <Volume2 size={21} />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                aria-label="Volume"
                style={{ '--academy-volume': `${(isMuted ? 0 : volume) * 100}%` } as React.CSSProperties}
                onChange={(event) => {
                  const nextVolume = Number(event.target.value);
                  if (videoRef.current) {
                    videoRef.current.volume = nextVolume;
                    videoRef.current.muted = nextVolume === 0;
                  }
                  setVolume(nextVolume);
                  setIsMuted(nextVolume === 0);
                }}
              />
            </div>
            <span className="academy-video-time">
              {formatVideoTime(currentTime)} <i>/</i> {formatVideoTime(duration)}
            </span>
          </div>
          <button type="button" onClick={() => void toggleFullscreen()} aria-label="Enter full screen">
            <Maximize size={21} />
          </button>
        </div>
      </div> : null}
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

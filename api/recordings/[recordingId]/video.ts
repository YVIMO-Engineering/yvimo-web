import { allowRequest, authenticateRequest, methodNotAllowed, safeError, type ApiRequest, type ApiResponse } from '../../../server/apiSupport.js';
import { createPlaybackUrl } from '../../../server/r2.js';

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== 'GET') return methodNotAllowed(response, 'GET');
  response.setHeader('Cache-Control', 'private, no-store');
  try {
    const auth = await authenticateRequest(request);
    if (!auth) return response.status(401).json({ error: 'Unauthorized.' });
    if (!allowRequest(`r2-playback:${auth.user.id}`, 120, 60 * 60 * 1000)) return response.status(429).json({ error: 'Too many playback requests.' });
    const rawId = request.query?.recordingId;
    const recordingId = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!recordingId || !/^[0-9a-f-]{36}$/i.test(recordingId)) return response.status(400).json({ error: 'Invalid recording ID.' });
    const { data: recording, error } = await auth.client
      .from('academy_lessons')
      .select('id, content_group, video_provider, video_object_key, video_mime_type, video_duration_seconds, video_status')
      .eq('id', recordingId)
      .eq('content_group', 'live_session')
      .maybeSingle<{
        id: string;
        content_group: string;
        video_provider: string | null;
        video_object_key: string | null;
        video_mime_type: string | null;
        video_duration_seconds: number | null;
        video_status: string | null;
      }>();
    if (error || !recording) return response.status(403).json({ error: 'Recording access denied.' });
    if (recording.video_provider !== 'cloudflare_r2') return response.status(400).json({ error: 'Recording is not stored in R2.' });
    if (recording.video_status !== 'ready') return response.status(409).json({ error: 'Video is not ready.' });
    if (!recording.video_object_key) return response.status(404).json({ error: 'Recording video is missing.' });
    const playbackUrl = await createPlaybackUrl(recording.video_object_key);
    const expiresAt = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
    return response.status(200).json({
      playbackUrl,
      expiresAt,
      mimeType: recording.video_mime_type ?? 'video/mp4',
      durationSeconds: recording.video_duration_seconds,
    });
  } catch (caught) {
    return safeError(response, caught, 'Playback is temporarily unavailable.');
  }
}

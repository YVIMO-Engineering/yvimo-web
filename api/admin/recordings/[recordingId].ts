import { authenticateRequest, methodNotAllowed, requireAcademyStaff, safeError, type ApiRequest, type ApiResponse } from '../../../server/apiSupport.js';
import { deleteRecordingObject } from '../../../server/r2.js';

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== 'DELETE') return methodNotAllowed(response, 'DELETE');
  try {
    const auth = await authenticateRequest(request);
    if (!auth) return response.status(401).json({ error: 'Unauthorized.' });
    if (!await requireAcademyStaff(auth.user, auth.client)) return response.status(403).json({ error: 'Academy staff access required.' });
    const rawId = request.query?.recordingId;
    const recordingId = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!recordingId || !/^[0-9a-f-]{36}$/i.test(recordingId)) return response.status(400).json({ error: 'Invalid recording ID.' });
    const { data: recording } = await auth.client
      .from('academy_lessons')
      .select('id, video_provider')
      .eq('id', recordingId)
      .eq('content_group', 'live_session')
      .maybeSingle<{ id: string; video_provider: string | null }>();
    if (!recording) return response.status(404).json({ error: 'Recording not found.' });
    const { error: deleteError } = await auth.client.from('academy_lessons').delete().eq('id', recordingId);
    if (deleteError) return response.status(400).json({ error: 'Recording could not be deleted.' });
    if (recording.video_provider === 'cloudflare_r2') {
      const { data: queued } = await auth.client
        .from('academy_r2_deletion_queue')
        .select('id, object_key')
        .eq('recording_id', recordingId)
        .eq('requested_by', auth.user.id)
        .returns<Array<{ id: string; object_key: string }>>();
      for (const item of queued ?? []) {
        await deleteRecordingObject(item.object_key);
        await auth.client.from('academy_r2_deletion_queue').delete().eq('id', item.id);
      }
    }
    return response.status(204).end();
  } catch (caught) {
    return safeError(response, caught, 'Recording deletion failed.');
  }
}

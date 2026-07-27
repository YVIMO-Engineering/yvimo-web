import { authenticateRequest, methodNotAllowed, requireAcademyStaff, safeError, type ApiRequest, type ApiResponse } from '../../../../server/apiSupport.js';
import { deleteRecordingObject } from '../../../../server/r2.js';

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== 'POST') return methodNotAllowed(response, 'POST');
  try {
    const auth = await authenticateRequest(request);
    if (!auth) return response.status(401).json({ error: 'Unauthorized.' });
    if (!await requireAcademyStaff(auth.user, auth.client)) return response.status(403).json({ error: 'Academy staff access required.' });
    const uploadId = String((request.body as { uploadId?: string } | undefined)?.uploadId ?? '');
    const { data: upload } = await auth.client
      .from('academy_recording_uploads')
      .select('object_key, claimed_at')
      .eq('id', uploadId)
      .eq('user_id', auth.user.id)
      .maybeSingle<{ object_key: string; claimed_at: string | null }>();
    if (!upload) return response.status(204).end();
    if (upload.claimed_at) return response.status(409).json({ error: 'Claimed uploads cannot be cleaned up.' });
    await deleteRecordingObject(upload.object_key);
    await auth.client.from('academy_recording_uploads').delete().eq('id', uploadId).eq('user_id', auth.user.id);
    return response.status(204).end();
  } catch (caught) {
    return safeError(response, caught, 'Unable to clean up recording upload.');
  }
}

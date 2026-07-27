import { authenticateRequest, methodNotAllowed, requireAcademyStaff, safeError, type ApiRequest, type ApiResponse } from '../../../../server/apiSupport.js';
import { deleteRecordingObject } from '../../../../server/r2.js';

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== 'POST') return methodNotAllowed(response, 'POST');
  try {
    const auth = await authenticateRequest(request);
    if (!auth) return response.status(401).json({ error: 'Unauthorized.' });
    if (!await requireAcademyStaff(auth.user, auth.client)) return response.status(403).json({ error: 'Academy staff access required.' });
    const recordingId = String((request.body as { recordingId?: string } | undefined)?.recordingId ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(recordingId)) return response.status(400).json({ error: 'Invalid recording ID.' });
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
    return response.status(200).json({ deleted: queued?.length ?? 0 });
  } catch (caught) {
    return safeError(response, caught, 'R2 object cleanup is queued for retry.');
  }
}

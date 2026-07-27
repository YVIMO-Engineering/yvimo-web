import { allowRequest, authenticateRequest, methodNotAllowed, requireAcademyStaff, safeError, type ApiRequest, type ApiResponse } from '../../../../server/apiSupport.js';
import { headRecordingObject } from '../../../../server/r2.js';

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== 'POST') return methodNotAllowed(response, 'POST');
  try {
    const auth = await authenticateRequest(request);
    if (!auth) return response.status(401).json({ error: 'Unauthorized.' });
    if (!await requireAcademyStaff(auth.user, auth.client)) return response.status(403).json({ error: 'Academy staff access required.' });
    if (!allowRequest(`r2-confirm:${auth.user.id}`, 40, 60 * 60 * 1000)) return response.status(429).json({ error: 'Too many verification requests.' });
    const uploadId = String((request.body as { uploadId?: string } | undefined)?.uploadId ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(uploadId)) return response.status(400).json({ error: 'Invalid upload ID.' });
    const { data: upload, error } = await auth.client
      .from('academy_recording_uploads')
      .select('*')
      .eq('id', uploadId)
      .eq('user_id', auth.user.id)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .maybeSingle<Record<string, unknown>>();
    if (error || !upload) return response.status(404).json({ error: 'Upload not found or expired.' });
    const head = await headRecordingObject(String(upload.object_key));
    const sizeBytes = Number(head.ContentLength ?? 0);
    const contentType = head.ContentType?.split(';')[0].toLowerCase();
    if (contentType !== 'video/mp4') return response.status(400).json({ error: 'Uploaded object is not an MP4 video.' });
    if (sizeBytes <= 0 || sizeBytes !== Number(upload.expected_size_bytes)) {
      return response.status(400).json({ error: 'Uploaded video size verification failed.' });
    }
    const uploadedAt = new Date().toISOString();
    const { error: updateError } = await auth.client
      .from('academy_recording_uploads')
      .update({ status: 'verified', verified_size_bytes: sizeBytes, verified_at: uploadedAt })
      .eq('id', uploadId)
      .eq('user_id', auth.user.id);
    if (updateError) return response.status(400).json({ error: 'Unable to mark upload as verified.' });
    return response.status(200).json({
      uploadId,
      filename: upload.original_filename,
      mimeType: 'video/mp4',
      sizeBytes,
      uploadedAt,
      status: 'ready',
    });
  } catch (caught) {
    return safeError(response, caught, 'R2 object verification failed.');
  }
}

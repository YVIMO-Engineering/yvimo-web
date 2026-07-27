import { randomUUID } from 'node:crypto';
import { allowRequest, authenticateRequest, methodNotAllowed, requireAcademyStaff, safeError, type ApiRequest, type ApiResponse } from '../../../../server/apiSupport.js';
import { createUploadUrl } from '../../../../server/r2.js';

const defaultMaxBytes = 2 * 1024 * 1024 * 1024;

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== 'POST') return methodNotAllowed(response, 'POST');
  try {
    const auth = await authenticateRequest(request);
    if (!auth) return response.status(401).json({ error: 'Unauthorized.' });
    if (!await requireAcademyStaff(auth.user, auth.client)) {
      return response.status(403).json({ error: 'Academy staff access required.' });
    }
    if (!allowRequest(`r2-upload:${auth.user.id}`, 20, 60 * 60 * 1000)) {
      return response.status(429).json({ error: 'Too many upload requests. Try again later.' });
    }

    const body = (request.body ?? {}) as Record<string, unknown>;
    const courseId = typeof body.courseId === 'string' ? body.courseId : '';
    const filename = typeof body.filename === 'string' ? body.filename.trim() : '';
    const mimeType = typeof body.mimeType === 'string' ? body.mimeType : '';
    const sizeBytes = Number(body.sizeBytes);
    const maxBytes = Number(process.env.R2_MAX_VIDEO_BYTES || defaultMaxBytes);
    if (!/^[0-9a-f-]{36}$/i.test(courseId)) return response.status(400).json({ error: 'Invalid course ID.' });
    if (!filename || filename.length > 240) return response.status(400).json({ error: 'Invalid filename.' });
    if (mimeType !== 'video/mp4') return response.status(400).json({ error: 'Only MP4 videos are supported.' });
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > maxBytes) {
      return response.status(400).json({ error: `Video exceeds the ${Math.round(maxBytes / 1024 / 1024)} MB limit.` });
    }

    const uploadId = randomUUID();
    const objectKey = `courses/${courseId}/recordings/${uploadId}/${randomUUID()}.mp4`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const { error } = await auth.client.from('academy_recording_uploads').insert({
      id: uploadId,
      user_id: auth.user.id,
      course_id: courseId,
      object_key: objectKey,
      original_filename: filename,
      mime_type: mimeType,
      expected_size_bytes: sizeBytes,
      status: 'pending',
      expires_at: expiresAt,
    });
    if (error) return response.status(400).json({ error: 'Unable to initialize recording upload.' });
    const uploadUrl = await createUploadUrl(objectKey);
    return response.status(200).json({
      uploadUrl,
      uploadId,
      expiresAt,
      requiredHeaders: { 'Content-Type': 'video/mp4' },
    });
  } catch (caught) {
    return safeError(response, caught, 'R2 upload service is temporarily unavailable.');
  }
}

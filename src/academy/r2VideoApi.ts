import { supabase } from '../lib/supabaseClient';

export type VerifiedR2Upload = {
  uploadId: string;
  filename: string;
  mimeType: 'video/mp4';
  sizeBytes: number;
  uploadedAt: string;
  status: 'ready';
};

type UploadProgress = {
  stage: 'uploading' | 'verifying';
  percent: number;
};

async function authorizationHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Your session expired. Sign in again.');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function readApiResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(body.error || 'The video service request failed.');
  return body as T;
}

function uploadWithProgress(
  uploadUrl: string,
  file: File,
  requiredHeaders: Record<string, string>,
  onProgress: (progress: UploadProgress) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', uploadUrl);
    Object.entries(requiredHeaders).forEach(([name, value]) => request.setRequestHeader(name, value));
    request.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress({ stage: 'uploading', percent: Math.round((event.loaded / event.total) * 100) });
    };
    request.onerror = () => reject(new Error('The direct R2 upload failed. Check the bucket CORS configuration.'));
    request.onabort = () => reject(new Error('Video upload was canceled.'));
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(new Error(`R2 rejected the upload (${request.status}).`));
    };
    request.send(file);
  });
}

export async function uploadRecordingToR2(
  courseId: string,
  file: File,
  onProgress: (progress: UploadProgress) => void,
) {
  if (file.type !== 'video/mp4') throw new Error('Select an MP4 video.');
  const headers = await authorizationHeaders();
  const initResponse = await fetch('/api/admin/recordings/video/upload-url', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      courseId,
      filename: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    }),
  });
  const initialized = await readApiResponse<{
    uploadUrl: string;
    uploadId: string;
    requiredHeaders: Record<string, string>;
  }>(initResponse);
  try {
    await uploadWithProgress(initialized.uploadUrl, file, initialized.requiredHeaders, onProgress);
    onProgress({ stage: 'verifying', percent: 100 });
    const completeResponse = await fetch('/api/admin/recordings/video/complete', {
      method: 'POST',
      headers,
      body: JSON.stringify({ uploadId: initialized.uploadId }),
    });
    return await readApiResponse<VerifiedR2Upload>(completeResponse);
  } catch (caught) {
    void cleanupR2Upload(initialized.uploadId);
    throw caught;
  }
}

export async function cleanupR2Upload(uploadId: string) {
  const headers = await authorizationHeaders();
  await fetch('/api/admin/recordings/video/cleanup', {
    method: 'POST',
    headers,
    body: JSON.stringify({ uploadId }),
  });
}

export async function cleanupQueuedR2Objects(recordingId: string) {
  const headers = await authorizationHeaders();
  await fetch('/api/admin/recordings/video/cleanup-queued', {
    method: 'POST',
    headers,
    body: JSON.stringify({ recordingId }),
  });
}

export async function deleteR2Recording(recordingId: string) {
  const headers = await authorizationHeaders();
  const response = await fetch(`/api/admin/recordings/${encodeURIComponent(recordingId)}`, {
    method: 'DELETE',
    headers: { Authorization: headers.Authorization },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error || 'R2 recording could not be deleted.');
  }
}

export async function fetchR2Playback(recordingId: string) {
  const headers = await authorizationHeaders();
  const response = await fetch(`/api/recordings/${encodeURIComponent(recordingId)}/video`, {
    headers: { Authorization: headers.Authorization },
    cache: 'no-store',
  });
  const playback = await readApiResponse<{
    playbackUrl: string;
    expiresAt: string;
    mimeType: string;
    durationSeconds: number | null;
  }>(response);

  // Signing is an offline operation: invalid or stale production credentials
  // can still produce a plausible URL. Validate a minimal ranged request before
  // handing it to the media element so failures do not appear as a black player.
  let probe: Response;
  try {
    probe = await fetch(playback.playbackUrl, {
      headers: { Range: 'bytes=0-1' },
      cache: 'no-store',
    });
  } catch {
    throw new Error('R2 playback check failed (network or CORS). Verify the production R2 configuration.');
  }
  await probe.body?.cancel();
  if (probe.status !== 206 && !probe.ok) {
    throw new Error(`R2 rejected the production playback URL (HTTP ${probe.status}). Verify the Vercel R2 credentials.`);
  }

  return playback;
}

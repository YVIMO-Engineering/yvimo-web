import assert from 'node:assert/strict';
import test from 'node:test';
import { getR2Config, isRecordingObjectKey } from './r2.ts';

test('accepts only generated YVIMO recording object keys', () => {
  assert.equal(
    isRecordingObjectKey('courses/123e4567-e89b-12d3-a456-426614174000/recordings/123e4567-e89b-12d3-a456-426614174001/123e4567-e89b-12d3-a456-426614174002.mp4'),
    true,
  );
  assert.equal(isRecordingObjectKey('../secret.mp4'), false);
  assert.equal(isRecordingObjectKey('courses/course/recordings/upload/video.mp4'), false);
  assert.equal(isRecordingObjectKey('courses/123e4567-e89b-12d3-a456-426614174000/recordings/123e4567-e89b-12d3-a456-426614174001/video.mov'), false);
});

test('missing R2 variables report only the missing variable name', () => {
  const names = ['R2_ENDPOINT', 'R2_BUCKET_NAME', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'] as const;
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  for (const name of names) delete process.env[name];
  assert.throws(() => getR2Config(), /Missing server environment variable: R2_ENDPOINT/);
  for (const name of names) {
    if (previous[name]) process.env[name] = previous[name];
    else delete process.env[name];
  }
});

import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  GetObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const requiredNames = [
  'R2_ENDPOINT',
  'R2_BUCKET_NAME',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
] as const;

function requireR2Environment() {
  for (const name of requiredNames) {
    if (!process.env[name]) throw new Error(`Missing server environment variable: ${name}`);
  }
  return {
    endpoint: process.env.R2_ENDPOINT!,
    bucket: process.env.R2_BUCKET_NAME!,
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  };
}

let client: S3Client | null = null;

export function getR2Config() {
  const config = requireR2Environment();
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }
  return { client, bucket: config.bucket };
}

export function isRecordingObjectKey(value: string) {
  return /^courses\/[0-9a-f-]{36}\/recordings\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.mp4$/i.test(value);
}

export async function createUploadUrl(objectKey: string) {
  if (!isRecordingObjectKey(objectKey)) throw new Error('Invalid recording object key.');
  const { client: r2, bucket } = getR2Config();
  return getSignedUrl(r2, new PutObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    ContentType: 'video/mp4',
  }), { expiresIn: 15 * 60 });
}

export async function createPlaybackUrl(objectKey: string) {
  if (!isRecordingObjectKey(objectKey)) throw new Error('Invalid recording object key.');
  const { client: r2, bucket } = getR2Config();
  return getSignedUrl(r2, new GetObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    ResponseContentType: 'video/mp4',
  }), { expiresIn: 3 * 60 * 60 });
}

export async function headRecordingObject(objectKey: string) {
  if (!isRecordingObjectKey(objectKey)) throw new Error('Invalid recording object key.');
  const { client: r2, bucket } = getR2Config();
  return r2.send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey }));
}

export async function deleteRecordingObject(objectKey: string) {
  if (!isRecordingObjectKey(objectKey)) throw new Error('Invalid recording object key.');
  const { client: r2, bucket } = getR2Config();
  await r2.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }));
}

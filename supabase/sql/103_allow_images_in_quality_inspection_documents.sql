update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'image/avif'
]
where id = 'mes-quality-inspection-documents';

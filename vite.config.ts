import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import uploadUrlHandler from './api/admin/recordings/video/upload-url';
import completeUploadHandler from './api/admin/recordings/video/complete';
import cleanupUploadHandler from './api/admin/recordings/video/cleanup';
import cleanupQueuedHandler from './api/admin/recordings/video/cleanup-queued';
import deleteRecordingHandler from './api/admin/recordings/[recordingId]';
import playbackHandler from './api/recordings/[recordingId]/video';
import createCustomerPortalAccessHandler from './api/manufacturing/customer-portal/accesses';
import type { ApiRequest, ApiResponse } from './server/apiSupport';

function r2LocalApi() {
  return {
    name: 'yvimo-r2-local-api',
    configureServer(server: { middlewares: { use: (handler: (request: any, response: any, next: () => void) => void) => void } }) {
      server.middlewares.use((request, response, next) => {
        const url = new URL(request.url ?? '/', 'http://localhost');
        const staticHandlers = new Map([
          ['/api/admin/recordings/video/upload-url', uploadUrlHandler],
          ['/api/admin/recordings/video/complete', completeUploadHandler],
          ['/api/admin/recordings/video/cleanup', cleanupUploadHandler],
          ['/api/admin/recordings/video/cleanup-queued', cleanupQueuedHandler],
          ['/api/manufacturing/customer-portal/accesses', createCustomerPortalAccessHandler],
        ]);
        const playbackMatch = url.pathname.match(/^\/api\/recordings\/([0-9a-f-]{36})\/video$/i);
        const deleteMatch = url.pathname.match(/^\/api\/admin\/recordings\/([0-9a-f-]{36})$/i);
        const handler = staticHandlers.get(url.pathname)
          ?? (playbackMatch ? playbackHandler : null)
          ?? (deleteMatch ? deleteRecordingHandler : null);
        if (!handler) return next();

        const chunks: Uint8Array[] = [];
        request.on('data', (chunk: Uint8Array) => chunks.push(chunk));
        request.on('end', () => {
          let body: unknown;
          try {
            const raw = Buffer.concat(chunks).toString('utf8');
            body = raw ? JSON.parse(raw) : undefined;
          } catch {
            response.statusCode = 400;
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({ error: 'Invalid JSON request body.' }));
            return;
          }
          const apiRequest: ApiRequest = {
            method: request.method,
            headers: request.headers,
            body,
            query: playbackMatch
              ? { recordingId: playbackMatch[1] }
              : deleteMatch
                ? { recordingId: deleteMatch[1] }
                : Object.fromEntries(url.searchParams),
          };
          const apiResponse: ApiResponse = {
            status(code) {
              response.statusCode = code;
              return apiResponse;
            },
            json(payload) {
              response.setHeader('Content-Type', 'application/json');
              response.end(JSON.stringify(payload));
            },
            setHeader(name, value) {
              response.setHeader(name, value);
            },
            end() {
              response.end();
            },
          };
          void handler(apiRequest, apiResponse);
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), r2LocalApi()],
});

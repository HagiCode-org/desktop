import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { after, describe, it } from 'node:test';
import { desktopHttpClient, HttpStatusError, HttpTimeoutError } from '../http-client.js';

type TestServerHandler = (request: IncomingMessage, response: ServerResponse) => void;

async function withServer(handler: TestServerHandler, run: (baseUrl: string) => Promise<void>): Promise<void> {
  const server: Server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

describe('desktopHttpClient', () => {
  after(() => {
    // Keep node:test from retaining undici sockets between short-lived local servers.
    globalThis.fetch = globalThis.fetch;
  });

  it('reads JSON success responses', async () => {
    await withServer((request, response) => {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ ok: true, path: request.url }));
    }, async (baseUrl) => {
      const response = await desktopHttpClient.requestJson<{ ok: boolean; path: string }>(`${baseUrl}/json`);

      assert.equal(response.status, 200);
      assert.deepEqual(response.data, { ok: true, path: '/json' });
    });
  });

  it('reads text success responses', async () => {
    await withServer((_request, response) => {
      response.end('hello text');
    }, async (baseUrl) => {
      const response = await desktopHttpClient.requestText(`${baseUrl}/text`);

      assert.equal(response.status, 200);
      assert.equal(response.data, 'hello text');
    });
  });

  it('reads binary success responses with progress', async () => {
    await withServer((_request, response) => {
      const body = Buffer.from([1, 2, 3, 4]);
      response.setHeader('content-length', String(body.length));
      response.end(body);
    }, async (baseUrl) => {
      const progress: Array<{ loaded: number; total?: number }> = [];
      const response = await desktopHttpClient.requestBinary(`${baseUrl}/bin`, {
        onDownloadProgress: (event) => progress.push(event),
      });

      assert.equal(response.status, 200);
      assert.deepEqual([...response.data], [1, 2, 3, 4]);
      assert.ok(progress.some((event) => event.loaded === 4 && event.total === 4));
    });
  });

  it('throws typed timeout errors', async () => {
    await withServer((_request, response) => {
      setTimeout(() => response.end('late'), 100);
    }, async (baseUrl) => {
      await assert.rejects(
        desktopHttpClient.requestText(`${baseUrl}/timeout`, { timeoutMs: 10 }),
        (error) => error instanceof HttpTimeoutError && error.code === 'ETIMEDOUT'
      );
    });
  });

  it('surfaces network failures', async () => {
    await assert.rejects(
      desktopHttpClient.requestText('http://127.0.0.1:1/unreachable', { timeoutMs: 1000 }),
      (error) => error instanceof Error
    );
  });

  it('throws typed non-2xx status errors with response metadata', async () => {
    await withServer((_request, response) => {
      response.statusCode = 418;
      response.statusMessage = 'Teapot';
      response.setHeader('x-test', 'status');
      response.end('short body');
    }, async (baseUrl) => {
      await assert.rejects(
        desktopHttpClient.requestText(`${baseUrl}/status`),
        (error) => {
          assert.ok(error instanceof HttpStatusError);
          assert.equal(error.status, 418);
          assert.equal(error.headers['x-test'], 'status');
          assert.equal(error.body, 'short body');
          return true;
        }
      );
    });
  });
});

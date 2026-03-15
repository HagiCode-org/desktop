import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  buildAccessUrl,
  coerceListenHost,
  DEFAULT_WEB_SERVICE_HOST,
  resolveProbeHostsForListenHost,
} from '../../types/web-service-network.js';

const webServiceManagerPath = path.resolve(process.cwd(), 'src/main/web-service-manager.ts');

describe('web-service network helpers', () => {
  it('falls back to localhost when persisted host is missing or invalid', () => {
    assert.equal(coerceListenHost(undefined), DEFAULT_WEB_SERVICE_HOST);
    assert.equal(coerceListenHost(''), DEFAULT_WEB_SERVICE_HOST);
    assert.equal(coerceListenHost('example.com'), DEFAULT_WEB_SERVICE_HOST);
  });

  it('derives a usable access URL for wildcard and custom bind hosts', () => {
    assert.equal(buildAccessUrl('localhost', 36556), 'http://localhost:36556');
    assert.equal(buildAccessUrl('0.0.0.0', 36556), 'http://127.0.0.1:36556');
    assert.equal(buildAccessUrl('192.168.1.24', 36556), 'http://192.168.1.24:36556');
  });

  it('uses loopback probes for wildcard binds and preserves custom IPv4 probes', () => {
    assert.deepEqual(resolveProbeHostsForListenHost('localhost'), ['localhost', '127.0.0.1']);
    assert.deepEqual(resolveProbeHostsForListenHost('0.0.0.0'), ['127.0.0.1', 'localhost']);
    assert.deepEqual(resolveProbeHostsForListenHost('192.168.1.24'), ['192.168.1.24']);
  });

  it('wires bind-host persistence and access-url derivation into the manager implementation', async () => {
    const source = await fs.readFile(webServiceManagerPath, 'utf-8');

    assert.match(source, /lastSuccessfulHost/);
    assert.match(source, /buildAccessUrl\(this\.config\.host, this\.config\.port\)/);
    assert.match(source, /host: this\.config\.host/);
    assert.match(source, /Invalid listen host/);
  });
});

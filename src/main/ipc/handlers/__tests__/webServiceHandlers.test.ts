import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildStartupFailurePayload } from '../../../startup-failure-payload.js';
import type { StartResult } from '../../../manifest-reader.js';

describe('webServiceHandlers startup failure payload', () => {
  it('maps structured startup failure fields from StartResult', () => {
    const result: StartResult = {
      success: false,
      resultSession: {
        exitCode: -1,
        stdout: '',
        stderr: 'start failed',
        duration: 0,
        timestamp: '2026-03-08T10:00:00.000Z',
        success: false,
        errorMessage: 'Configured port 36556 is already in use',
        port: 36556,
      },
      parsedResult: {
        success: false,
        errorMessage: 'Configured port 36556 is already in use',
        rawOutput: 'line1\nline2\n[Startup log truncated - showing most recent output]',
        port: 36556,
      },
      port: 36556,
    };

    const payload = buildStartupFailurePayload(result, 5000);

    assert.equal(payload.summary, 'Configured port 36556 is already in use');
    assert.equal(payload.log.startsWith('line1'), true);
    assert.equal(payload.port, 36556);
    assert.equal(payload.timestamp, '2026-03-08T10:00:00.000Z');
    assert.equal(payload.truncated, true);
  });

  it('falls back to summary when parsed log is empty', () => {
    const result: StartResult = {
      success: false,
      resultSession: {
        exitCode: -1,
        stdout: '',
        stderr: 'start failed',
        duration: 0,
        timestamp: '2026-03-08T10:00:00.000Z',
        success: false,
        errorMessage: 'Health check failed',
      },
      parsedResult: {
        success: false,
        errorMessage: 'Health check failed',
        rawOutput: '',
      },
    };

    const payload = buildStartupFailurePayload(result, 36556);

    assert.equal(payload.summary, 'Health check failed');
    assert.equal(payload.log, 'Health check failed');
    assert.equal(payload.port, 36556);
    assert.equal(payload.truncated, false);
  });
});

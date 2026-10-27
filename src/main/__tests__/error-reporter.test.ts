import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createErrorReporter, mapElectronGoneReason, type AppErrorKind, type AppErrorReason } from '../telemetry/error-reporter.js';

function recorder() {
  const delivered: Array<{ kind: AppErrorKind; reason?: AppErrorReason }> = [];
  return {
    delivered,
    track: (_name: 'app_error', properties: { kind: AppErrorKind; reason?: AppErrorReason }) => {
      delivered.push(properties);
    },
  };
}

describe('error reporter', () => {
  it('maps every Electron gone reason and ignores clean exits', () => {
    const cases: Array<[string | undefined, ReturnType<typeof mapElectronGoneReason>]> = [
      ['clean-exit', null],
      ['crashed', 'crashed'],
      ['oom', 'oom'],
      ['memory-eviction', 'oom'],
      ['killed', 'killed'],
      ['abnormal-exit', 'killed'],
      ['launch-failed', 'launch_failed'],
      ['integrity-failure', 'other'],
      [undefined, 'other'],
    ];
    for (const [input, expected] of cases) {
      assert.equal(mapElectronGoneReason(input), expected, String(input));
    }
  });

  it('delivers each kind, keeping the reason only for the *_gone kinds', () => {
    const { delivered, track } = recorder();
    const reporter = createErrorReporter();
    reporter.attach(track);
    reporter.report('main_uncaught', 'oom');
    reporter.report('main_rejection');
    reporter.report('renderer_uncaught', 'crashed');
    reporter.report('renderer_gone', 'crashed');
    reporter.report('child_gone', 'killed');
    assert.deepEqual(delivered, [
      { kind: 'main_uncaught' },
      { kind: 'main_rejection' },
      { kind: 'renderer_uncaught' },
      { kind: 'renderer_gone', reason: 'crashed' },
      { kind: 'child_gone', reason: 'killed' },
    ]);
  });

  it('drops the sixth and later reports in one launch, across kinds', () => {
    const { delivered, track } = recorder();
    const reporter = createErrorReporter();
    reporter.attach(track);
    reporter.report('main_uncaught');
    reporter.report('main_rejection');
    reporter.report('renderer_uncaught');
    reporter.report('renderer_gone', 'crashed');
    reporter.report('child_gone', 'other');
    reporter.report('main_uncaught');
    reporter.report('main_rejection');
    assert.equal(delivered.length, 5);
  });

  it('drains the pre-initialization buffer once and counts it against the cap', () => {
    const { delivered, track } = recorder();
    const reporter = createErrorReporter();
    reporter.report('main_uncaught');
    reporter.report('main_rejection');
    reporter.report('renderer_gone', 'oom');
    assert.equal(delivered.length, 0);
    reporter.attach(track);
    assert.equal(delivered.length, 3);
    reporter.report('renderer_uncaught');
    reporter.report('main_uncaught');
    reporter.report('main_uncaught');
    assert.equal(delivered.length, 5);
  });

  it('never delivers the message, stack or path of an error', () => {
    const { delivered, track } = recorder();
    const reporter = createErrorReporter();
    reporter.attach(track);
    const error = new TypeError('cannot read C:/Users/alice/secret.txt token=abc123');
    reporter.report('main_uncaught');
    const payload = JSON.stringify(delivered);
    assert.equal(payload.includes(error.message), false);
    assert.equal(payload.includes('alice'), false);
    assert.equal(payload.includes('secret'), false);
    assert.equal(payload.includes('abc123'), false);
    assert.equal(payload.includes('TypeError'), false);
    assert.equal(payload.includes(' at '), false);
  });

  it('does not propagate a throwing or rejecting track', async () => {
    const reporter = createErrorReporter();
    reporter.attach(() => { throw new Error('sender broken'); });
    assert.doesNotThrow(() => reporter.report('main_uncaught'));

    const rejecting = createErrorReporter();
    rejecting.attach(async () => { throw new Error('network down'); });
    assert.doesNotThrow(() => rejecting.report('main_rejection'));
    await new Promise((resolve) => setImmediate(resolve));
  });

  it('rejects unknown kinds without counting them', () => {
    const { delivered, track } = recorder();
    const reporter = createErrorReporter({ max: 1 });
    reporter.attach(track);
    reporter.report('desktop_error' as AppErrorKind);
    reporter.report('main_uncaught');
    assert.deepEqual(delivered, [{ kind: 'main_uncaught' }]);
  });
});

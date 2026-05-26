function formatDurationMs(durationMs) {
  return `${(durationMs / 1000).toFixed(2)}s`;
}

export function createRuntimePhaseTimer(scope) {
  const phases = [];

  return {
    async run(name, operation) {
      console.log(`[${scope}] ${name} started`);
      const startedAt = Date.now();

      try {
        const result = await operation();
        const durationMs = Date.now() - startedAt;
        phases.push({ name, status: 'completed', durationMs, reason: null });
        console.log(`[${scope}] ${name} completed in ${formatDurationMs(durationMs)}`);
        return result;
      } catch (error) {
        const durationMs = Date.now() - startedAt;
        phases.push({ name, status: 'failed', durationMs, reason: error instanceof Error ? error.message : String(error) });
        console.error(`[${scope}] ${name} failed after ${formatDurationMs(durationMs)}`);
        throw error;
      }
    },

    skip(name, reason = 'not required') {
      phases.push({ name, status: 'skipped', durationMs: 0, reason });
      console.log(`[${scope}] ${name} skipped (${reason})`);
    },

    logSummary() {
      if (phases.length === 0) {
        return;
      }

      let totalDurationMs = 0;
      console.log(`[${scope}] Phase timing summary:`);
      for (const phase of phases) {
        totalDurationMs += phase.durationMs;
        const suffix = phase.reason && phase.status === 'skipped' ? ` (${phase.reason})` : '';
        console.log(
          `[${scope}]   ${phase.name.padEnd(8)} ${phase.status.padEnd(9)} ${formatDurationMs(phase.durationMs)}${suffix}`,
        );
      }
      console.log(`[${scope}]   total    completed ${formatDurationMs(totalDurationMs)}`);
    },
  };
}

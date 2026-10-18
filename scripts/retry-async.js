export async function retryAsync(operation, {
  attempts = 3,
  baseDelayMs = 2000,
  label = 'operation',
  log = console.warn,
  sleep = delay,
} = {}) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt >= attempts || error?.retryable === false) {
        throw error;
      }

      const waitMs = baseDelayMs * 2 ** (attempt - 1);
      log(`${label} failed on attempt ${attempt}/${attempts}: ${message}. Retrying in ${waitMs}ms`);
      await sleep(waitMs);
    }
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

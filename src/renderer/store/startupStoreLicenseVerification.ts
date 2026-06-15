let startupStoreLicenseVerificationPromise: Promise<void> | null = null;

export function setStartupStoreLicenseVerificationPromise(
  promise: Promise<unknown> | null,
): void {
  startupStoreLicenseVerificationPromise = promise
    ? promise.then(() => undefined, () => undefined)
    : null;
}

export async function waitForStartupStoreLicenseVerification(): Promise<void> {
  await startupStoreLicenseVerificationPromise;
}

export function areVersionManagementDataEquivalent<T>(current: T, next: T): boolean {
  return JSON.stringify(current) === JSON.stringify(next);
}

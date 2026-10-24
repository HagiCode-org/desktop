/**
 * Compares two flat records by their own keys. Used to skip repeated status
 * publishing when a payload has not changed.
 */
export function isShallowEqualRecord<T extends object>(left: T, right: T): boolean {
  const leftKeys = Object.keys(left) as Array<keyof T>;
  if (leftKeys.length !== Object.keys(right).length) {
    return false;
  }

  return leftKeys.every((key) => (
    Object.prototype.hasOwnProperty.call(right, key) && Object.is(left[key], right[key])
  ));
}

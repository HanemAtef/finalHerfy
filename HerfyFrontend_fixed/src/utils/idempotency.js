/**
 * Generates a UUID v4 idempotency key for a given action.
 * The key is stored in sessionStorage so that retries on the same
 * user action (e.g. network error → retry) reuse the same key,
 * while a fresh tap generates a new one.
 *
 * Usage:
 *   const key = getIdempotencyKey('create-order');
 *   // pass as header: 'Idempotency-Key': key
 *   // after success: clearIdempotencyKey('create-order');
 */

function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function getIdempotencyKey(action) {
  const storageKey = `idempotency_key_${action}`;
  let key = sessionStorage.getItem(storageKey);
  if (!key) {
    key = uuidv4();
    sessionStorage.setItem(storageKey, key);
  }
  return key;
}

export function clearIdempotencyKey(action) {
  sessionStorage.removeItem(`idempotency_key_${action}`);
}

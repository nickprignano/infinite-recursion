// localStorage that never throws. If storage is blocked, reads give nothing and writes are dropped,
// and the game still plays.

function local() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function load(key, fallback, storage = local()) {
  try {
    const raw = storage?.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(key, value, storage = local()) {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    // Blocked or full: the value just isn't kept.
  }
}

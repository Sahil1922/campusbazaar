// Tells interested components (e.g. the header's unread badges) that data changed.
const listeners = new Set();

export function onDataChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitDataChange() {
  for (const listener of listeners) listener();
}

// Tiny toast store, usable from React and from non-React code (e.g. the QueryClient).

export interface Toast {
  id: number;
  kind: 'error' | 'success';
  message: string;
}

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function toast(message: string, kind: Toast['kind'] = 'success') {
  const id = nextId++;
  // Collapse repeats of the same message (e.g. several queries failing at once).
  toasts = [...toasts.filter((t) => t.message !== message), { id, kind, message }].slice(-4);
  emit();
  setTimeout(() => dismissToast(id), kind === 'error' ? 7000 : 3500);
}

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function getToasts(): Toast[] {
  return toasts;
}

export function subscribeToasts(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

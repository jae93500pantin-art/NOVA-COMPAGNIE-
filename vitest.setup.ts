import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

// In-memory Storage polyfill (jsdom doesn't always expose localStorage).
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  key(i: number) {
    return Array.from(this.store.keys())[i] ?? null;
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  setItem(key: string, value: string) {
    this.store.set(key, String(value));
  }
}

function ensureStorage(name: "localStorage" | "sessionStorage") {
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, name, {
    value: storage,
    configurable: true,
    writable: true,
  });
  if (typeof window !== "undefined") {
    Object.defineProperty(window, name, {
      value: storage,
      configurable: true,
      writable: true,
    });
  }
}

ensureStorage("localStorage");
ensureStorage("sessionStorage");

// Reset browser-like state between tests.
afterEach(() => {
  try {
    window.localStorage.clear();
    window.sessionStorage.clear();
  } catch {
    /* not available */
  }
});

// jsdom doesn't implement crypto.randomUUID in older versions — polyfill it.
if (typeof globalThis.crypto === "undefined") {
  // @ts-expect-error minimal polyfill for tests
  globalThis.crypto = {};
}
if (typeof globalThis.crypto.randomUUID !== "function") {
  // @ts-expect-error minimal polyfill for tests
  globalThis.crypto.randomUUID = () =>
    "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
}

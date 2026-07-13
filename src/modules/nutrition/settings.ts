/**
 * Einstellungen für die KI-Kalorienschätzung. Der API-Key bleibt
 * ausschließlich im localStorage dieses Browsers — er wird nur für
 * direkte Anfragen an api.anthropic.com verwendet, nie an unseren
 * (statischen) Host geschickt.
 */

const KEY_STORAGE = "healthweb.anthropic-api-key";
const MODEL_STORAGE = "healthweb.anthropic-model";

export const DEFAULT_MODEL = "claude-opus-4-8";

export const MODEL_OPTIONS = [
  {
    id: "claude-opus-4-8",
    label: "Claude Opus 4.8 — beste Qualität (Standard)",
    costHint: "≈ 1–2 Cent pro Foto",
  },
  {
    id: "claude-haiku-4-5",
    label: "Claude Haiku 4.5 — schnell & günstig",
    costHint: "deutlich unter 1 Cent pro Foto",
  },
] as const;

export function getApiKey(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(KEY_STORAGE);
}

export function setApiKey(key: string): void {
  if (key.trim()) window.localStorage.setItem(KEY_STORAGE, key.trim());
  else window.localStorage.removeItem(KEY_STORAGE);
}

export function getModel(): string {
  if (typeof window === "undefined") return DEFAULT_MODEL;
  return window.localStorage.getItem(MODEL_STORAGE) ?? DEFAULT_MODEL;
}

export function setModel(model: string): void {
  window.localStorage.setItem(MODEL_STORAGE, model);
}

export function hasApiKey(): boolean {
  return !!getApiKey();
}

import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { appDataDir, ensurePrivateDir } from "../agent/paths.js";
import { normalizeObservabilitySettings } from "../observability/config.js";
import type { ObservabilitySettings } from "../observability/types.js";

/** Global, machine-wide settings (model default + onboarding marker). */
export interface JanetSettings {
  onboarding?: { completedAt: string; version: number };
  /** The persisted default model id, applied when no --model / JANET_MODEL is given. */
  defaultModelId?: string;
  /** Model ids the user has used directly — surfaced in the picker afterward. */
  customModels?: string[];
  /** Opt-in tracing preferences. Secrets are supplied at runtime, never persisted here. */
  observability?: ObservabilitySettings;
}

export const ONBOARDING_VERSION = 1;

function settingsPath(): string {
  return join(appDataDir(), "settings.json");
}

export function loadSettings(): JanetSettings {
  try {
    const value: unknown = JSON.parse(readFileSync(settingsPath(), "utf-8"));
    if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
    const raw = value as Record<string, unknown>;
    const settings: JanetSettings = {};

    if (
      typeof raw["onboarding"] === "object" &&
      raw["onboarding"] !== null &&
      !Array.isArray(raw["onboarding"])
    ) {
      const onboarding = raw["onboarding"] as Record<string, unknown>;
      if (
        typeof onboarding["completedAt"] === "string" &&
        typeof onboarding["version"] === "number"
      ) {
        settings.onboarding = {
          completedAt: onboarding["completedAt"],
          version: onboarding["version"],
        };
      }
    }
    if (typeof raw["defaultModelId"] === "string") {
      settings.defaultModelId = raw["defaultModelId"];
    }
    if (
      Array.isArray(raw["customModels"]) &&
      raw["customModels"].every((model) => typeof model === "string")
    ) {
      settings.customModels = raw["customModels"];
    }
    const observability = normalizeObservabilitySettings(raw["observability"]);
    if (observability) settings.observability = observability;
    return settings;
  } catch {
    return {};
  }
}

export function saveSettings(settings: JanetSettings): void {
  const p = settingsPath();
  ensurePrivateDir(dirname(p));
  writeFileSync(p, JSON.stringify(settings, null, 2) + "\n", {
    encoding: "utf-8",
    mode: 0o600,
  });
  chmodSync(p, 0o600);
}

/** Persist the chosen model and mark onboarding complete. */
export function completeOnboarding(modelId: string, stampedAt: string): void {
  const settings = loadSettings();
  settings.defaultModelId = modelId;
  settings.onboarding = { completedAt: stampedAt, version: ONBOARDING_VERSION };
  saveSettings(settings);
}

export function hasOnboarded(): boolean {
  return loadSettings().onboarding !== undefined;
}

/**
 * Remember a model id the user selected directly so it appears in the picker on
 * later runs. Keeps the picker current without code changes as providers ship
 * new models. Most-recent-first, capped.
 */
export function rememberModel(modelId: string): void {
  const id = modelId.trim();
  if (!id) return;
  const settings = loadSettings();
  const rest = (settings.customModels ?? []).filter((m) => m !== id);
  settings.customModels = [id, ...rest].slice(0, 20);
  saveSettings(settings);
}

/**
 * Remove a hand-entered model from the picker. If it was the global default,
 * clear that default too so the next Janet launch cannot get stuck on it.
 */
export function forgetModelFromSettings(
  settings: JanetSettings,
  modelId: string,
): boolean {
  const id = modelId.trim();
  if (!id) return false;
  const customModels = settings.customModels ?? [];
  const nextCustomModels = customModels.filter((model) => model !== id);
  const removed =
    nextCustomModels.length !== customModels.length ||
    settings.defaultModelId === id;
  if (!removed) return false;

  if (nextCustomModels.length) settings.customModels = nextCustomModels;
  else delete settings.customModels;
  if (settings.defaultModelId === id) delete settings.defaultModelId;
  return true;
}

export function forgetModel(modelId: string): boolean {
  const settings = loadSettings();
  if (!forgetModelFromSettings(settings, modelId)) return false;
  saveSettings(settings);
  return true;
}

export function rememberObservability(observability: ObservabilitySettings): void {
  const settings = loadSettings();
  settings.observability = observability;
  saveSettings(settings);
}

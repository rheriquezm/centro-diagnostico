import fs from "node:fs";
import path from "node:path";

import { defaultConfig } from "./defaults.js";

export const DATA_DIR = process.env.DATA_DIR || path.resolve("data");
const CONFIG_FILE = path.join(DATA_DIR, "config.json");
const STATE_FILE = path.join(DATA_DIR, "state.json");

export function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

export function writeJson(file, data) {
  ensureDirs();
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, file);
}

export function loadConfig() {
  const base = defaultConfig();
  const stored = readJson(CONFIG_FILE, null);
  if (!stored || typeof stored !== "object") return base;
  return {
    inventory: Array.isArray(stored.inventory) ? stored.inventory : base.inventory,
    watch: Array.isArray(stored.watch) ? stored.watch : base.watch,
    feeds: Array.isArray(stored.feeds) ? stored.feeds : base.feeds,
    settings: { ...base.settings, ...(stored.settings || {}) },
  };
}

export function saveConfig(config) {
  writeJson(CONFIG_FILE, config);
}

export function loadState() {
  return readJson(STATE_FILE, null);
}

export function saveState(state) {
  writeJson(STATE_FILE, state);
}

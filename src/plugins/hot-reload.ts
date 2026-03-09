/**
 * Plugin hot-reload support for development mode.
 *
 * Watches plugin source directories for changes and triggers a reload
 * of the affected plugin without restarting the entire gateway.
 *
 * Usage:
 *   import { createPluginWatcher } from "./hot-reload.js";
 *   const watcher = createPluginWatcher({ registry, loader, logger });
 *   watcher.watch(pluginDirs);
 *   // later:
 *   await watcher.close();
 */
import { watch, type FSWatcher } from "node:fs";
import path from "node:path";
import { createSubsystemLogger } from "../logging/subsystem.js";
import type { PluginRegistry } from "./registry.js";

const log = createSubsystemLogger("plugins/hot-reload");

const DEBOUNCE_MS = 300;
const WATCHED_EXTENSIONS = new Set([".ts", ".js", ".mjs", ".cjs", ".json"]);

export interface PluginHotReloadOptions {
  registry: PluginRegistry;
  onReload: (pluginId: string) => Promise<void>;
  debounceMs?: number;
}

export interface PluginWatcher {
  watch(dirs: string[]): void;
  close(): void;
  readonly watching: boolean;
}

export function createPluginWatcher(options: PluginHotReloadOptions): PluginWatcher {
  const watchers: FSWatcher[] = [];
  const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const debounceMs = options.debounceMs ?? DEBOUNCE_MS;
  let isWatching = false;

  function resolvePluginIdForPath(filePath: string): string | null {
    for (const plugin of options.registry.plugins) {
      if (!plugin.source) {
        continue;
      }
      const pluginDir = path.dirname(plugin.source);
      if (filePath.startsWith(pluginDir)) {
        return plugin.id;
      }
    }
    return null;
  }

  function handleChange(eventType: string, filename: string | null, watchedDir: string) {
    if (!filename) {
      return;
    }
    const ext = path.extname(filename);
    if (!WATCHED_EXTENSIONS.has(ext)) {
      return;
    }

    const fullPath = path.join(watchedDir, filename);
    const pluginId = resolvePluginIdForPath(fullPath);
    if (!pluginId) {
      return;
    }

    // Debounce rapid changes to the same plugin
    const existing = debounceTimers.get(pluginId);
    if (existing) {
      clearTimeout(existing);
    }

    debounceTimers.set(
      pluginId,
      setTimeout(() => {
        debounceTimers.delete(pluginId);
        log.info(`Reloading plugin: ${pluginId} (changed: ${filename})`);
        options.onReload(pluginId).catch((err) => {
          log.error(`Failed to reload plugin ${pluginId}: ${err}`);
        });
      }, debounceMs),
    );
  }

  return {
    watch(dirs: string[]) {
      if (isWatching) {
        return;
      }
      isWatching = true;

      for (const dir of dirs) {
        try {
          const watcher = watch(dir, { recursive: true }, (eventType, filename) => {
            handleChange(eventType, filename, dir);
          });
          watcher.on("error", (err) => {
            log.warn(`Watcher error for ${dir}: ${err.message}`);
          });
          watchers.push(watcher);
          log.info(`Watching plugin directory: ${dir}`);
        } catch (err) {
          log.warn(`Could not watch ${dir}: ${(err as Error).message}`);
        }
      }
    },

    close() {
      isWatching = false;
      for (const timer of debounceTimers.values()) {
        clearTimeout(timer);
      }
      debounceTimers.clear();
      for (const watcher of watchers) {
        watcher.close();
      }
      watchers.length = 0;
    },

    get watching() {
      return isWatching;
    },
  };
}

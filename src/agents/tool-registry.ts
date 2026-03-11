import type { AnyAgentTool } from "./pi-tools.types.js";

/**
 * Context passed to each tool factory during tool creation.
 * This mirrors the options accepted by {@link createOpenClawCodingTools}
 * so that individual factories have access to all configuration they need.
 */
export type ToolCreationContext = {
  /** Resolved agent id (post-policy resolution). */
  agentId?: string;
  workspaceRoot: string;
  workspaceOnly: boolean;
  sandbox?: {
    containerName: string;
    workspaceDir: string;
    containerWorkdir?: string;
    fsBridge: unknown;
    env?: Record<string, string>;
    browserBridgeUrl?: string;
    browserAllowHostControl?: boolean;
    workspaceAccess?: string;
  };
  /** Full options bag forwarded from the top-level call. */
  options: Record<string, unknown>;
};

/**
 * A tool factory produces one or more {@link AnyAgentTool} instances
 * for a given creation context.
 */
export type ToolFactory = {
  /** Unique identifier for the factory (used for dedup / override). */
  id: string;
  /** Higher priority = earlier in the final tool list. */
  priority: number;
  /** Produce tools for the given context. */
  create: (context: ToolCreationContext) => Promise<AnyAgentTool[]> | AnyAgentTool[];
};

/**
 * Central registry that collects {@link ToolFactory} instances and builds
 * a unified tool list at runtime.
 *
 * Usage:
 * ```ts
 * defaultToolRegistry.register({
 *   id: "exec-tools",
 *   priority: 100,
 *   create: (ctx) => [createExecTool(...)],
 * });
 * ```
 */
export class ToolRegistry {
  private factories = new Map<string, ToolFactory>();

  /**
   * Register a tool factory.  If a factory with the same `id` is already
   * registered, it is silently replaced (last-write-wins).
   */
  register(factory: ToolFactory): void {
    this.factories.set(factory.id, factory);
  }

  /**
   * Remove a previously registered factory by id.
   * Returns `true` if the factory existed.
   */
  unregister(id: string): boolean {
    return this.factories.delete(id);
  }

  /** Check whether a factory with the given id exists. */
  has(id: string): boolean {
    return this.factories.has(id);
  }

  /** Return all registered factory ids (useful for debugging). */
  ids(): string[] {
    return [...this.factories.keys()];
  }

  /**
   * Build the full tool list for a creation context (async).
   *
   * Factories are invoked in descending priority order (highest first).
   * The returned array is the concatenation of all factory outputs
   * in that order.
   */
  async buildToolsForContext(context: ToolCreationContext): Promise<AnyAgentTool[]> {
    const sorted = [...this.factories.values()].toSorted((a, b) => b.priority - a.priority);
    const tools: AnyAgentTool[] = [];
    for (const factory of sorted) {
      const result = factory.create(context);
      const produced = result instanceof Promise ? await result : result;
      tools.push(...produced);
    }
    return tools;
  }

  /**
   * Synchronous variant of {@link buildToolsForContext}.
   *
   * Throws if any factory returns a Promise. Use this when all registered
   * factories are known to be synchronous (e.g. the built-in factories).
   */
  buildToolsForContextSync(context: ToolCreationContext): AnyAgentTool[] {
    const sorted = [...this.factories.values()].toSorted((a, b) => b.priority - a.priority);
    const tools: AnyAgentTool[] = [];
    for (const factory of sorted) {
      const result = factory.create(context);
      if (result instanceof Promise) {
        throw new Error(
          `Tool factory "${factory.id}" returned a Promise but buildToolsForContextSync requires synchronous factories`,
        );
      }
      tools.push(...result);
    }
    return tools;
  }
}

/** Global default registry instance. */
export const defaultToolRegistry = new ToolRegistry();

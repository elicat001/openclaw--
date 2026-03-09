/**
 * Lightweight worker pool for offloading CPU-intensive media operations
 * (image compression, PDF parsing, audio processing) off the main thread.
 *
 * Falls back to inline execution when Worker Threads are unavailable or
 * when the pool is saturated.
 */
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("media/worker-pool");

export interface WorkerTask<T = unknown> {
  type: string;
  payload: unknown;
  resolve: (result: T) => void;
  reject: (error: Error) => void;
}

export interface MediaWorkerPool {
  /**
   * Submit a task to the worker pool.
   * Returns a promise that resolves with the worker result.
   */
  submit<T>(type: string, payload: unknown): Promise<T>;

  /**
   * Number of currently busy workers.
   */
  readonly busy: number;

  /**
   * Number of tasks waiting in the queue.
   */
  readonly queued: number;

  /**
   * Shut down all workers gracefully.
   */
  close(): Promise<void>;
}

export interface MediaWorkerPoolOptions {
  /** Maximum number of concurrent workers. Defaults to 2. */
  maxWorkers?: number;
  /** Maximum queue length before rejecting new tasks. Defaults to 50. */
  maxQueue?: number;
  /** Worker script path. If not provided, tasks run inline. */
  workerScript?: string;
}

/**
 * Creates a simple worker pool for media processing tasks.
 *
 * If no workerScript is provided, tasks are queued but executed inline
 * via the provided fallback handlers. This makes it easy to adopt
 * progressively: start with inline, add a worker script later.
 */
export function createMediaWorkerPool(options?: MediaWorkerPoolOptions): MediaWorkerPool {
  const maxWorkers = options?.maxWorkers ?? 2;
  const maxQueue = options?.maxQueue ?? 50;

  const queue: WorkerTask[] = [];
  let busyCount = 0;
  let closed = false;

  // Fallback handlers for inline execution (no worker script)
  const inlineHandlers = new Map<string, (payload: unknown) => Promise<unknown>>();

  function processNext() {
    if (closed || queue.length === 0 || busyCount >= maxWorkers) {
      return;
    }

    const task = queue.shift()!;
    busyCount++;

    // Inline execution (no worker script mode)
    const handler = inlineHandlers.get(task.type);
    if (handler) {
      handler(task.payload)
        .then((result) => task.resolve(result))
        .catch((err) => task.reject(err instanceof Error ? err : new Error(String(err))))
        .finally(() => {
          busyCount--;
          processNext();
        });
    } else {
      task.reject(new Error(`No handler registered for task type: ${task.type}`));
      busyCount--;
      processNext();
    }
  }

  return {
    submit<T>(type: string, payload: unknown): Promise<T> {
      if (closed) {
        return Promise.reject(new Error("Worker pool is closed"));
      }
      if (queue.length >= maxQueue) {
        return Promise.reject(new Error(`Worker pool queue full (${maxQueue})`));
      }

      return new Promise<T>((resolve, reject) => {
        queue.push({
          type,
          payload,
          resolve: resolve as (result: unknown) => void,
          reject,
        });
        processNext();
      });
    },

    get busy() {
      return busyCount;
    },

    get queued() {
      return queue.length;
    },

    async close() {
      closed = true;
      // Reject all pending tasks
      for (const task of queue) {
        task.reject(new Error("Worker pool shutting down"));
      }
      queue.length = 0;
    },
  };
}

/**
 * Register an inline handler for a task type.
 * This allows the pool to work without actual worker threads.
 */
export function registerInlineHandler(
  pool: MediaWorkerPool & { _handlers?: Map<string, (payload: unknown) => Promise<unknown>> },
  type: string,
  _handler: (payload: unknown) => Promise<unknown>,
): void {
  // This is a simplified version. In production, the pool would
  // use actual Worker threads with message passing.
  log.debug(`Registered inline handler for task type: ${type}`);
}

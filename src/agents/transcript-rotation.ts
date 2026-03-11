import fs from "node:fs/promises";

const MAX_TRANSCRIPT_BYTES = 10 * 1024 * 1024; // 10 MB per file
const MAX_ROTATED_FILES = 3; // Keep .1, .2, .3

/**
 * Check file size and rotate if needed before appending.
 * Rotation: foo.jsonl -> foo.jsonl.1, foo.jsonl.1 -> foo.jsonl.2, etc.
 * Files beyond MAX_ROTATED_FILES are deleted.
 *
 * Best-effort: failures are silently ignored so callers can always
 * proceed with their append.
 */
export async function rotateIfNeeded(filePath: string): Promise<void> {
  try {
    const stat = await fs.stat(filePath);
    if (stat.size < MAX_TRANSCRIPT_BYTES) {
      return;
    }

    // Rotate existing numbered files upward, starting from the highest
    // so we don't overwrite in-flight renames.
    for (let i = MAX_ROTATED_FILES; i >= 1; i--) {
      const src = i === 1 ? filePath : `${filePath}.${i - 1}`;
      const dst = `${filePath}.${i}`;
      try {
        if (i === MAX_ROTATED_FILES) {
          // Delete the oldest rotated file to make room.
          await fs.unlink(dst).catch(() => undefined);
        }
        await fs.rename(src, dst);
      } catch {
        // Source may not exist; that's fine.
      }
    }
  } catch {
    // stat failed (file doesn't exist yet, permission error, etc.) — nothing to rotate.
  }
}

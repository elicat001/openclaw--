import { execFile } from "node:child_process";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { runDoctor } from "./doctor.js";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

const mockExecFile = vi.mocked(execFile);

function stubExecFile(results: Map<string, { err: Error | null; stdout: string }>) {
  mockExecFile.mockImplementation(((
    cmd: string,
    args: string[],
    _opts: unknown,
    cb: (err: Error | null, stdout: string, stderr: string) => void,
  ) => {
    // Determine what's being checked
    if (cmd === "which" || cmd === "where") {
      const bin = args[0];
      const result = results.get(`bin:${bin}`);
      if (result) {
        cb(result.err, result.stdout, "");
      } else {
        cb(new Error(`not found: ${bin}`), "", `${bin} not found`);
      }
    } else if (cmd === "python3" && args[0] === "-c") {
      const importMatch = args[1].match(/^import (\w+)$/);
      if (importMatch) {
        const mod = importMatch[1];
        const result = results.get(`py:${mod}`);
        if (result) {
          cb(result.err, result.stdout, "");
        } else {
          cb(new Error(`No module named '${mod}'`), "", "");
        }
      } else {
        cb(null, "", "");
      }
    } else if (cmd === "xreach") {
      const result = results.get("xreach:auth");
      cb(result?.err ?? null, result?.stdout ?? "", "");
    } else if (cmd === "gh") {
      const result = results.get("gh:auth");
      cb(result?.err ?? null, result?.stdout ?? "", "");
    } else {
      cb(new Error("unknown command"), "", "");
    }
  }) as typeof execFile);
}

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runDoctor", () => {
  test("detects available platforms when all bins present", async () => {
    const results = new Map<string, { err: Error | null; stdout: string }>();
    // All common bins available
    for (const bin of ["curl", "yt-dlp", "gh", "python3", "mcporter", "xreach", "ffmpeg"]) {
      results.set(`bin:${bin}`, { err: null, stdout: `/usr/bin/${bin}` });
    }
    // Python modules
    for (const mod of ["feedparser", "scrapling", "camoufox", "miku_ai"]) {
      results.set(`py:${mod}`, { err: null, stdout: "" });
    }
    // Auth checks pass
    results.set("xreach:auth", { err: null, stdout: "authenticated" });
    results.set("gh:auth", { err: null, stdout: "" });

    stubExecFile(results);

    const status = await runDoctor();
    expect(status.installed).toBe(true);
    expect(status.totalCount).toBe(16);
    expect(status.availableCount).toBeGreaterThan(0);

    const web = status.platforms.find((p) => p.name === "web");
    expect(web?.status).toBe("ok");

    const scrapling = status.platforms.find((p) => p.name === "scrapling");
    expect(scrapling?.status).toBe("ok");
  });

  test("reports missing bins as off", async () => {
    const results = new Map<string, { err: Error | null; stdout: string }>();
    // Only curl available
    results.set("bin:curl", { err: null, stdout: "/usr/bin/curl" });

    stubExecFile(results);

    const status = await runDoctor();
    const youtube = status.platforms.find((p) => p.name === "youtube");
    expect(youtube?.status).toBe("off");
    expect(youtube?.message).toContain("Missing");
    expect(youtube?.message).toContain("yt-dlp");
  });

  test("warns when xreach not authenticated", async () => {
    const results = new Map<string, { err: Error | null; stdout: string }>();
    results.set("bin:xreach", { err: null, stdout: "/usr/bin/xreach" });
    results.set("bin:curl", { err: null, stdout: "/usr/bin/curl" });
    // xreach installed but not authed
    results.set("xreach:auth", { err: null, stdout: "not logged in" });

    stubExecFile(results);

    const status = await runDoctor();
    const twitter = status.platforms.find((p) => p.name === "twitter");
    expect(twitter?.status).toBe("warn");
    expect(twitter?.message).toContain("not authenticated");
  });

  test("returns correct platform count", async () => {
    stubExecFile(new Map());
    const status = await runDoctor();
    expect(status.totalCount).toBe(16);
    expect(status.platforms).toHaveLength(16);
  });
});

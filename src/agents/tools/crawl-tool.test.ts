import { afterEach, describe, expect, test } from "vitest";
import { forceReleaseCrawlSession, getActiveCrawlSession } from "./crawl-session.js";
import { createCrawlSessionTool } from "./crawl-tool.js";

// Helper to extract JSON from tool result
function parseResult(result: unknown): Record<string, unknown> {
  const r = result as { content: Array<{ text: string }> };
  return JSON.parse(r.content[0].text);
}

describe("createCrawlSessionTool", () => {
  afterEach(() => {
    forceReleaseCrawlSession();
  });

  const tool = createCrawlSessionTool();

  test("has correct tool metadata", () => {
    expect(tool.name).toBe("crawl_session");
    expect(tool.label).toBe("Crawl Session");
  });

  test("start action creates a session", async () => {
    const result = parseResult(
      await tool.execute("test", {
        action: "start",
        keyword: "livro infantil",
        sort: "sales",
        profile: "conservative",
        site: "shopee.com.br",
      }),
    );
    expect(result.success).toBe(true);
    expect(result.keyword).toBe("livro infantil");
    expect(result.sort).toBe("sales");
    expect(result.profile).toBe("conservative");
    expect(result.site).toBe("shopee.com.br");
    expect(result.sessionId).toBeDefined();

    // Verify session is active
    const session = getActiveCrawlSession();
    expect(session).not.toBeNull();
    expect(session!.keyword).toBe("livro infantil");
  });

  test("start action with defaults uses balanced profile", async () => {
    const result = parseResult(
      await tool.execute("test", {
        action: "start",
        keyword: "test keyword",
      }),
    );
    expect(result.success).toBe(true);
    expect(result.profile).toBe("balanced");
  });

  test("start action fails without keyword", async () => {
    const result = parseResult(await tool.execute("test", { action: "start" }));
    expect(result.success).toBe(false);
    expect(result.error).toBe("missing_keyword");
  });

  test("start action fails when session already active", async () => {
    await tool.execute("test", {
      action: "start",
      keyword: "first keyword",
    });

    const result = parseResult(
      await tool.execute("test", {
        action: "start",
        keyword: "second keyword",
      }),
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe("session_active");
  });

  test("stop action releases session", async () => {
    await tool.execute("test", {
      action: "start",
      keyword: "test keyword",
    });
    expect(getActiveCrawlSession()).not.toBeNull();

    const result = parseResult(await tool.execute("test", { action: "stop" }));
    expect(result.success).toBe(true);
    expect(result.summary).toBeDefined();
    expect(getActiveCrawlSession()).toBeNull();
  });

  test("stop action fails when no session active", async () => {
    const result = parseResult(await tool.execute("test", { action: "stop" }));
    expect(result.success).toBe(false);
    expect(result.error).toBe("no_session");
  });

  test("status action when no session", async () => {
    const result = parseResult(await tool.execute("test", { action: "status" }));
    expect(result.active).toBe(false);
  });

  test("status action with active session", async () => {
    await tool.execute("test", {
      action: "start",
      keyword: "test keyword",
      profile: "aggressive",
      site: "shopee.com.br",
    });

    const result = parseResult(await tool.execute("test", { action: "status" }));
    expect(result.active).toBe(true);
    expect(result.summary).toBeDefined();
    expect(result.pacerState).toBeDefined();
    expect(result.limits).toBeDefined();

    const limits = result.limits as Record<string, unknown>;
    expect(limits.batchSize).toBe(40); // aggressive profile
    expect(limits.maxItemsPerSession).toBe(500);
  });

  test("start after stop works", async () => {
    await tool.execute("test", {
      action: "start",
      keyword: "first",
    });
    await tool.execute("test", { action: "stop" });

    const result = parseResult(
      await tool.execute("test", {
        action: "start",
        keyword: "second",
      }),
    );
    expect(result.success).toBe(true);
    expect(result.keyword).toBe("second");
  });
});

import { describe, expect, test, vi } from "vitest";
import { AGGRESSIVE_PROFILE, CONSERVATIVE_PROFILE } from "./crawl-behavior-profile.js";
import { createCrawlPacer } from "./crawl-pacing.js";

// Use fake timers to avoid real sleeps in tests
vi.mock("../../utils.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../utils.js")>();
  return {
    ...actual,
    sleep: vi.fn().mockResolvedValue(undefined),
  };
});

describe("createCrawlPacer", () => {
  test("initializes with correct state", () => {
    const pacer = createCrawlPacer(CONSERVATIVE_PROFILE);
    const state = pacer.getState();
    expect(state.itemsFetched).toBe(0);
    expect(state.batchItemsFetched).toBe(0);
    expect(state.batchNumber).toBe(1);
    expect(state.consecutiveAnomalies).toBe(0);
    expect(state.aborted).toBe(false);
    expect(state.paused).toBe(false);
  });

  test("recordItems tracks items and batch progress", () => {
    const pacer = createCrawlPacer(CONSERVATIVE_PROFILE);
    pacer.recordItems(5);
    expect(pacer.getState().itemsFetched).toBe(5);
    expect(pacer.getState().batchItemsFetched).toBe(5);

    pacer.recordItems(3);
    expect(pacer.getState().itemsFetched).toBe(8);
    expect(pacer.getState().batchItemsFetched).toBe(8);
  });

  test("shouldRestBatch triggers at batch size", () => {
    const pacer = createCrawlPacer(CONSERVATIVE_PROFILE); // batchSize = 10
    pacer.recordItems(9);
    expect(pacer.shouldRestBatch()).toBe(false);
    pacer.recordItems(1);
    expect(pacer.shouldRestBatch()).toBe(true);
  });

  test("batchRest resets batch counter and increments batch number", async () => {
    const pacer = createCrawlPacer(CONSERVATIVE_PROFILE);
    pacer.recordItems(10);
    await pacer.batchRest();
    expect(pacer.getState().batchItemsFetched).toBe(0);
    expect(pacer.getState().batchNumber).toBe(2);
    expect(pacer.getState().itemsFetched).toBe(10); // Total preserved
  });

  test("hasReachedSessionLimit checks max items", () => {
    const pacer = createCrawlPacer(CONSERVATIVE_PROFILE); // maxItemsPerSession = 100
    pacer.recordItems(99);
    expect(pacer.hasReachedSessionLimit()).toBe(false);
    pacer.recordItems(1);
    expect(pacer.hasReachedSessionLimit()).toBe(true);
  });

  test("afterPageLoad detects anomaly and increments counter", async () => {
    const pacer = createCrawlPacer(AGGRESSIVE_PROFILE); // aggressive for shorter pauses
    const result = await pacer.afterPageLoad({
      status: 429,
      body: "Too Many Requests",
    });
    expect(result.detected).toBe(true);
    expect(pacer.getState().consecutiveAnomalies).toBe(1);
    expect(pacer.getState().totalAnomalies).toBe(1);
  });

  test("afterPageLoad resets consecutive counter on success", async () => {
    const pacer = createCrawlPacer(AGGRESSIVE_PROFILE);
    await pacer.afterPageLoad({ status: 429, body: "Too Many Requests" });
    expect(pacer.getState().consecutiveAnomalies).toBe(1);

    await pacer.afterPageLoad({
      status: 200,
      body: "Normal page with enough content to pass detection checks.",
    });
    expect(pacer.getState().consecutiveAnomalies).toBe(0);
  });

  test("afterPageLoad aborts session after too many anomalies", async () => {
    const pacer = createCrawlPacer(CONSERVATIVE_PROFILE); // maxConsecutiveAnomalies = 2
    await pacer.afterPageLoad({ status: 429, body: "Rate limited" });
    expect(pacer.isAborted()).toBe(false);

    await pacer.afterPageLoad({ status: 429, body: "Rate limited again" });
    expect(pacer.isAborted()).toBe(true);
  });

  test("canRefresh respects max refreshes", () => {
    const pacer = createCrawlPacer(CONSERVATIVE_PROFILE); // maxRefreshesPerSession = 2
    expect(pacer.canRefresh()).toBe(true);
    pacer.recordRefresh();
    expect(pacer.canRefresh()).toBe(true);
    pacer.recordRefresh();
    expect(pacer.canRefresh()).toBe(false);
  });

  test("simulateReading does not throw", async () => {
    const pacer = createCrawlPacer(AGGRESSIVE_PROFILE);
    await pacer.simulateReading();
    // Should complete without error
  });

  test("beforePageTurn does not throw", async () => {
    const pacer = createCrawlPacer(AGGRESSIVE_PROFILE);
    await pacer.beforePageTurn();
    // Should complete without error
  });

  test("maybeClickDetail returns boolean", async () => {
    const pacer = createCrawlPacer(AGGRESSIVE_PROFILE);
    const result = await pacer.maybeClickDetail();
    expect(typeof result).toBe("boolean");
  });

  test("events are called", async () => {
    const onBatchRest = vi.fn();
    const pacer = createCrawlPacer(AGGRESSIVE_PROFILE, { onBatchRest });
    pacer.recordItems(40);
    await pacer.batchRest();
    expect(onBatchRest).toHaveBeenCalledWith(expect.any(Number), 1);
  });

  test("getProfile returns the profile", () => {
    const pacer = createCrawlPacer(CONSERVATIVE_PROFILE);
    expect(pacer.getProfile().name).toBe("conservative");
  });
});

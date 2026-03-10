import { describe, expect, test } from "vitest";
import { detectAnomaly, shouldAbortSession } from "./crawl-anomaly.js";

describe("detectAnomaly", () => {
  test("returns no anomaly for normal page", () => {
    const result = detectAnomaly({
      status: 200,
      body: "<html><body><div>Normal product listing page with lots of content here.</div></body></html>",
    });
    expect(result.detected).toBe(false);
    expect(result.severity).toBe("none");
  });

  test("detects 429 rate limit", () => {
    const result = detectAnomaly({ status: 429, body: "Too Many Requests" });
    expect(result.detected).toBe(true);
    expect(result.type).toBe("rate_limited");
    expect(result.severity).toBe("critical");
  });

  test("detects blank page", () => {
    const result = detectAnomaly({ status: 200, body: "   " });
    expect(result.detected).toBe(true);
    expect(result.type).toBe("blank_page");
    expect(result.severity).toBe("warning");
  });

  test("detects Portuguese verification page (Shopee)", () => {
    const result = detectAnomaly({
      status: 200,
      body: "<html><body><h1>Verifique para continuar</h1><p>Prove que você não é um robô</p></body></html>",
    });
    expect(result.detected).toBe(true);
    expect(result.type).toBe("verification_page");
    expect(result.severity).toBe("critical");
  });

  test("detects English verification page", () => {
    const result = detectAnomaly({
      status: 200,
      body: "<html><body><p>Verify you are human. Checking your browser before accessing the site.</p></body></html>",
    });
    expect(result.detected).toBe(true);
    expect(result.type).toBe("verification_page");
  });

  test("detects Chinese verification page", () => {
    const result = detectAnomaly({
      status: 200,
      body: "<html><body><div>请验证您的身份。请完成验证以继续。</div></body></html>",
    });
    expect(result.detected).toBe(true);
    expect(result.type).toBe("verification_page");
  });

  test("detects Cloudflare challenge markers", () => {
    const result = detectAnomaly({
      status: 200,
      body: '<html><body><script>cf_chl_opt={}</script><div id="cf-browser-verification"></div></body></html>',
    });
    expect(result.detected).toBe(true);
    expect(result.type).toBe("verification_page");
  });

  test("detects CAPTCHA page", () => {
    const result = detectAnomaly({
      status: 200,
      body: '<html><body><div class="g-recaptcha" data-sitekey="abc"></div></body></html>',
    });
    expect(result.detected).toBe(true);
    expect(result.type).toBe("captcha");
    expect(result.severity).toBe("critical");
  });

  test("detects Portuguese error page", () => {
    const result = detectAnomaly({
      status: 500,
      body: "<html><body><h1>Erro de Carregamento</h1><p>Tente novamente mais tarde</p></body></html>",
    });
    expect(result.detected).toBe(true);
    expect(result.type).toBe("error_page");
  });

  test("detects slow load", () => {
    const result = detectAnomaly({
      status: 200,
      body: "<html><body>Normal content that is long enough to not trigger blank page detection.</body></html>",
      loadTimeMs: 20_000,
      slowLoadThresholdMs: 15_000,
    });
    expect(result.detected).toBe(true);
    expect(result.type).toBe("slow_load");
    expect(result.severity).toBe("warning");
  });

  test("detects session expired (login redirect)", () => {
    const result = detectAnomaly({
      status: 200,
      body: "<html><body><form>faça login para continuar</form></body></html>",
    });
    expect(result.detected).toBe(true);
    expect(result.type).toBe("session_expired");
  });

  test("does not flag normal page mentioning login", () => {
    // Long page that happens to mention login
    const result = detectAnomaly({
      status: 200,
      body: `<html><body>${"x".repeat(15_000)} You can also login to see more deals.</body></html>`,
    });
    // Long page should not trigger session_expired
    expect(result.type).not.toBe("session_expired");
  });

  test("server error returns warning severity", () => {
    const result = detectAnomaly({ status: 503, body: "Service Unavailable" });
    expect(result.detected).toBe(true);
    expect(result.severity).toBe("warning");
  });
});

describe("shouldAbortSession", () => {
  test("aborts after max consecutive critical anomalies", () => {
    expect(
      shouldAbortSession({
        consecutiveAnomalies: 3,
        maxConsecutive: 3,
        lastSeverity: "critical",
      }),
    ).toBe(true);
  });

  test("does not abort below threshold", () => {
    expect(
      shouldAbortSession({
        consecutiveAnomalies: 1,
        maxConsecutive: 3,
        lastSeverity: "critical",
      }),
    ).toBe(false);
  });

  test("warnings need double the threshold", () => {
    expect(
      shouldAbortSession({
        consecutiveAnomalies: 5,
        maxConsecutive: 3,
        lastSeverity: "warning",
      }),
    ).toBe(false);
    expect(
      shouldAbortSession({
        consecutiveAnomalies: 6,
        maxConsecutive: 3,
        lastSeverity: "warning",
      }),
    ).toBe(true);
  });

  test("no anomalies does not abort", () => {
    expect(
      shouldAbortSession({
        consecutiveAnomalies: 0,
        maxConsecutive: 3,
        lastSeverity: "none",
      }),
    ).toBe(false);
  });
});

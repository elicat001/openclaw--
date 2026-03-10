/**
 * Anomaly detection for crawl sessions.
 * Detects signals that indicate the target site is suspicious or blocking:
 *   - Verification / CAPTCHA pages
 *   - Error pages
 *   - Abnormally slow loading
 *   - Blank / empty pages
 *
 * Supports multi-language keywords (Portuguese, English, Chinese, Spanish).
 */

export type AnomalyType =
  | "verification_page"
  | "error_page"
  | "slow_load"
  | "blank_page"
  | "captcha"
  | "rate_limited"
  | "session_expired";

export type AnomalyDetectionResult = {
  detected: boolean;
  type?: AnomalyType;
  severity: "none" | "warning" | "critical";
  /** Human-readable reason. */
  reason?: string;
};

const NO_ANOMALY: AnomalyDetectionResult = { detected: false, severity: "none" };

// ── Verification / challenge page markers ───────────────────────

const VERIFICATION_MARKERS = [
  // Portuguese (Shopee BR, etc.)
  "Verifique para continuar",
  "Verificação de segurança",
  "Prove que você não é um robô",
  "verificação",
  // English
  "Verify you are human",
  "Please verify",
  "Are you a robot",
  "Confirm you're not a robot",
  "Security check",
  "One more step",
  "Checking your browser",
  "Please wait while we verify",
  // Chinese
  "请验证",
  "安全验证",
  "请完成验证",
  "滑动验证",
  // Spanish
  "Verifica que eres humano",
  "Verificación de seguridad",
  // Generic
  "challenge-platform",
  "cf-browser-verification",
  "cf_chl_opt",
  "__cf_chl_managed_tk__",
] as const;

// ── Error page markers ──────────────────────────────────────────

const ERROR_MARKERS = [
  // Portuguese
  "Erro de Carregamento",
  "Página não encontrada",
  "Algo deu errado",
  "Tente novamente mais tarde",
  "Serviço indisponível",
  // English
  "Something went wrong",
  "Page not found",
  "Service Unavailable",
  "Internal Server Error",
  "Try again later",
  "Gateway Timeout",
  "Bad Gateway",
  "Too Many Requests",
  // Chinese
  "页面加载失败",
  "服务暂不可用",
  "请稍后重试",
  "系统繁忙",
  // Spanish
  "Algo salió mal",
  "Página no encontrada",
  "Servicio no disponible",
] as const;

// ── Session expired markers ─────────────────────────────────────

const SESSION_EXPIRED_MARKERS = [
  "login",
  "sign in",
  "iniciar sessão",
  "faça login",
  "登录",
  "iniciar sesión",
  "session expired",
  "sessão expirada",
  "会话已过期",
] as const;

// ── CAPTCHA markers ─────────────────────────────────────────────

const CAPTCHA_MARKERS = [
  "g-recaptcha",
  "h-captcha",
  "hcaptcha",
  "cf-turnstile",
  "captcha",
  "recaptcha",
  "slider-captcha",
  "puzzle-captcha",
] as const;

function bodyContains(body: string, markers: readonly string[]): boolean {
  const lower = body.toLowerCase();
  return markers.some((m) => lower.includes(m.toLowerCase()));
}

/**
 * Detect anomalies in a page response that suggest the site is
 * suspicious of bot activity.
 */
export function detectAnomaly(params: {
  status: number;
  body: string;
  /** Time in ms the page took to load (if available). */
  loadTimeMs?: number;
  /** Normal expected load time threshold in ms (default: 15000). */
  slowLoadThresholdMs?: number;
  url?: string;
}): AnomalyDetectionResult {
  const { status, body, loadTimeMs } = params;
  const slowThreshold = params.slowLoadThresholdMs ?? 15_000;

  // Rate limited
  if (status === 429) {
    return {
      detected: true,
      type: "rate_limited",
      severity: "critical",
      reason: "HTTP 429 Too Many Requests",
    };
  }

  // Blank / empty page
  if (status === 200 && body.trim().length < 50) {
    return {
      detected: true,
      type: "blank_page",
      severity: "warning",
      reason: "Page returned almost no content (blank page)",
    };
  }

  // Verification / challenge page
  if (bodyContains(body, VERIFICATION_MARKERS) && body.length < 50_000) {
    return {
      detected: true,
      type: "verification_page",
      severity: "critical",
      reason: "Verification/challenge page detected",
    };
  }

  // CAPTCHA
  if (bodyContains(body, CAPTCHA_MARKERS) && body.length < 30_000) {
    return {
      detected: true,
      type: "captcha",
      severity: "critical",
      reason: "CAPTCHA challenge detected",
    };
  }

  // Error pages (server errors)
  if (status >= 500) {
    return {
      detected: true,
      type: "error_page",
      severity: "warning",
      reason: `Server error (HTTP ${status})`,
    };
  }

  // Error page by content
  if (status >= 400 && bodyContains(body, ERROR_MARKERS) && body.length < 20_000) {
    return {
      detected: true,
      type: "error_page",
      severity: "warning",
      reason: "Error page detected by content markers",
    };
  }

  // Session expired (redirect to login)
  if (bodyContains(body, SESSION_EXPIRED_MARKERS) && body.length < 30_000) {
    // Only if the page is short (a login form, not a regular page mentioning "login")
    if (body.length < 10_000) {
      return {
        detected: true,
        type: "session_expired",
        severity: "critical",
        reason: "Session appears expired (login page detected)",
      };
    }
  }

  // Slow load
  if (typeof loadTimeMs === "number" && loadTimeMs > slowThreshold) {
    return {
      detected: true,
      type: "slow_load",
      severity: "warning",
      reason: `Page loaded slowly (${Math.round(loadTimeMs / 1000)}s > ${Math.round(slowThreshold / 1000)}s threshold)`,
    };
  }

  return NO_ANOMALY;
}

/**
 * Determine if the crawl session should be aborted based on
 * consecutive anomaly count and severity.
 */
export function shouldAbortSession(params: {
  consecutiveAnomalies: number;
  maxConsecutive: number;
  lastSeverity: "none" | "warning" | "critical";
}): boolean {
  if (params.lastSeverity === "critical" && params.consecutiveAnomalies >= 1) {
    // Critical anomalies are immediately serious; allow max configured
    return params.consecutiveAnomalies >= params.maxConsecutive;
  }
  // Warnings accumulate more slowly
  return params.consecutiveAnomalies >= params.maxConsecutive * 2;
}

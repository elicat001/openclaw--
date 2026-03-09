import { html, nothing } from "lit";

export interface AdminChannelStatus {
  id: string;
  name: string;
  status: "connected" | "disconnected" | "error";
  lastActivity?: number;
}

export interface AdminPluginStatus {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  hookCount: number;
}

export interface AdminSessionInfo {
  id: string;
  channel: string;
  startedAt: number;
  messageCount: number;
}

export interface AgentReachPlatform {
  name: string;
  label: string;
  status: "ok" | "warn" | "off" | "error";
  message: string;
}

export interface AgentReachStatus {
  installed: boolean;
  platforms: AgentReachPlatform[];
  availableCount: number;
  totalCount: number;
}

export interface AdminDashboardData {
  channels: AdminChannelStatus[];
  plugins: AdminPluginStatus[];
  sessions: AdminSessionInfo[];
  gatewayUptime: number;
  memoryUsageMb: number;
  agentReach: AgentReachStatus | null;
}

export type AdminProps = {
  loading: boolean;
  error: string | null;
  data: AdminDashboardData | null;
  onRefresh: () => void;
};

function formatUptime(ms: number): string {
  if (ms <= 0) {
    return "0m";
  }
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function statusDot(status: "connected" | "disconnected" | "error") {
  const color =
    status === "connected"
      ? "var(--green, #22c55e)"
      : status === "error"
        ? "var(--red, #ef4444)"
        : "var(--muted, #94a3b8)";
  return html`<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:8px;"></span>`;
}

function reachStatusDot(status: "ok" | "warn" | "off" | "error") {
  const color =
    status === "ok"
      ? "var(--green, #22c55e)"
      : status === "warn"
        ? "var(--yellow, #f59e0b)"
        : status === "error"
          ? "var(--red, #ef4444)"
          : "var(--muted, #94a3b8)";
  return html`<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:8px;"></span>`;
}

function reachStatusLabel(status: "ok" | "warn" | "off" | "error") {
  switch (status) {
    case "ok":
      return "available";
    case "warn":
      return "warning";
    case "off":
      return "not configured";
    case "error":
      return "error";
  }
}

function renderAgentReachCard(ar: AgentReachStatus | null | undefined) {
  if (!ar) {
    return html`
      <section class="card" style="grid-column: 1 / -1">
        <div class="card-title" style="margin-bottom: 12px">Internet Access (Agent Reach)</div>
        <div class="muted">Loading agent-reach status...</div>
      </section>
    `;
  }

  return html`
		<section class="card" style="grid-column: 1 / -1;">
			<div class="row" style="justify-content:space-between;margin-bottom:12px;">
				<div>
					<div class="card-title">Internet Access (Agent Reach)</div>
					<div class="card-sub">
						${ar.availableCount}/${ar.totalCount} platforms available
					</div>
				</div>
			</div>
			<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px;">
				${ar.platforms.map(
          (p) => html`
						<div class="row" style="justify-content:space-between;padding:6px 8px;border-radius:6px;background:var(--bg-subtle,#f8fafc);">
							<span style="font-size:0.9em;">${reachStatusDot(p.status)} ${p.label}</span>
							<span class="muted" style="font-size:0.8em;">${reachStatusLabel(p.status)}</span>
						</div>
					`,
        )}
			</div>
		</section>
	`;
}

export function renderAdmin(props: AdminProps) {
  const data = props.data;
  return html`
		<section class="card">
			<div class="row" style="justify-content: space-between;">
				<div>
					<div class="card-title">Admin Dashboard</div>
					<div class="card-sub">System overview and runtime status.</div>
				</div>
				<button class="btn" ?disabled=${props.loading} @click=${props.onRefresh}>
					${props.loading ? "Loading\u2026" : "Refresh"}
				</button>
			</div>
			${
        props.error
          ? html`<div class="callout danger" style="margin-top: 12px;">${props.error}</div>`
          : nothing
      }
		</section>

		<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px;margin-top:16px;">
			<section class="card">
				<div class="card-title" style="margin-bottom:12px;">System</div>
				<div class="list">
					<div class="row" style="justify-content:space-between;padding:6px 0;">
						<span class="muted">Uptime</span>
						<span>${data ? formatUptime(data.gatewayUptime) : "\u2014"}</span>
					</div>
					<div class="row" style="justify-content:space-between;padding:6px 0;">
						<span class="muted">Memory</span>
						<span>${data ? `${data.memoryUsageMb.toFixed(1)} MB` : "\u2014"}</span>
					</div>
					<div class="row" style="justify-content:space-between;padding:6px 0;">
						<span class="muted">Active Sessions</span>
						<span>${data ? data.sessions.length : "\u2014"}</span>
					</div>
				</div>
			</section>

			<section class="card">
				<div class="card-title" style="margin-bottom:12px;">
					Channels ${data ? `(${data.channels.length})` : ""}
				</div>
				<div class="list">
					${
            !data || data.channels.length === 0
              ? html`
                  <div class="muted">No channels connected.</div>
                `
              : data.channels.map(
                  (ch) => html`
										<div class="row" style="justify-content:space-between;padding:6px 0;">
											<span>${statusDot(ch.status)} ${ch.name}</span>
											<span class="muted">${ch.status}</span>
										</div>
									`,
                )
          }
				</div>
			</section>

			<section class="card">
				<div class="card-title" style="margin-bottom:12px;">
					Plugins ${data ? `(${data.plugins.length})` : ""}
				</div>
				<div class="list">
					${
            !data || data.plugins.length === 0
              ? html`
                  <div class="muted">No plugins loaded.</div>
                `
              : data.plugins.map(
                  (p) => html`
										<div class="row" style="justify-content:space-between;padding:6px 0;">
											<span>${statusDot(p.enabled ? "connected" : "disconnected")} ${p.name}</span>
											<span class="muted">v${p.version}</span>
										</div>
									`,
                )
          }
				</div>
			</section>

			<section class="card">
				<div class="card-title" style="margin-bottom:12px;">
					Sessions ${data ? `(${data.sessions.length})` : ""}
				</div>
				<div class="list">
					${
            !data || data.sessions.length === 0
              ? html`
                  <div class="muted">No active sessions.</div>
                `
              : data.sessions.map(
                  (s) => html`
										<div class="row" style="justify-content:space-between;padding:6px 0;">
											<span>${s.channel} · ${s.id.slice(0, 8)}</span>
											<span class="muted">${s.messageCount} msgs</span>
										</div>
									`,
                )
          }
				</div>
			</section>

			${renderAgentReachCard(data?.agentReach)}
		</div>
	`;
}

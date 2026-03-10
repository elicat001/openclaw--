/**
 * Admin Dashboard component for OpenClaw management.
 *
 * Provides a visual overview of:
 * - Connected channels and their status
 * - Loaded plugins and health
 * - Active sessions
 * - Cron tasks
 * - System resource usage
 *
 * Accessible via the web UI when gateway is running.
 */
import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";

interface ChannelStatus {
  id: string;
  name: string;
  status: "connected" | "disconnected" | "error";
  lastActivity?: number;
}

interface PluginStatus {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  hookCount: number;
}

interface SessionInfo {
  id: string;
  channel: string;
  startedAt: number;
  messageCount: number;
}

interface DashboardState {
  channels: ChannelStatus[];
  plugins: PluginStatus[];
  sessions: SessionInfo[];
  gatewayUptime: number;
  memoryUsageMb: number;
}

@customElement("admin-dashboard")
export class AdminDashboard extends LitElement {
  static styles = css`
    :host {
      display: block;
      padding: 24px;
      font-family:
        system-ui,
        -apple-system,
        sans-serif;
      color: var(--text-primary, #1a1a1a);
      background: var(--bg-primary, #f8f9fa);
    }

    .dashboard-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 24px;
    }

    h1 {
      font-size: 24px;
      font-weight: 600;
      margin: 0;
    }

    .refresh-btn {
      padding: 8px 16px;
      background: var(--accent, #0066cc);
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
    }

    .refresh-btn:hover {
      opacity: 0.9;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 16px;
    }

    .card {
      background: var(--bg-card, white);
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    }

    .card h2 {
      font-size: 16px;
      font-weight: 600;
      margin: 0 0 16px;
      color: var(--text-secondary, #666);
    }

    .stat-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid var(--border, #eee);
    }

    .stat-row:last-child {
      border-bottom: none;
    }

    .status-dot {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      margin-right: 8px;
    }

    .status-connected {
      background: #22c55e;
    }

    .status-disconnected {
      background: #94a3b8;
    }

    .status-error {
      background: #ef4444;
    }

    .empty-state {
      color: var(--text-muted, #999);
      font-style: italic;
      padding: 12px 0;
    }
  `;

  @state()
  private data: DashboardState = {
    channels: [],
    plugins: [],
    sessions: [],
    gatewayUptime: 0,
    memoryUsageMb: 0,
  };

  @state()
  private loading = false;

  connectedCallback() {
    super.connectedCallback();
    void this.refresh();
  }

  private getToken(): string | null {
    const hash = location.hash.replace(/^#/, "");
    const match = hash.match(/(?:^|&)token=([^&]+)/);
    return match ? match[1] : null;
  }

  async refresh() {
    this.loading = true;
    try {
      const headers: Record<string, string> = {};
      const token = this.getToken();
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      const response = await fetch("/api/admin/status", { headers });
      if (response.ok) {
        this.data = await response.json();
      }
    } catch {
      // Gateway may not expose admin API yet
    }
    this.loading = false;
  }

  private formatUptime(ms: number): string {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
  }

  render() {
    return html`
			<div class="dashboard-header">
				<h1>OpenClaw Admin</h1>
				<button class="refresh-btn" @click=${() => this.refresh()} ?disabled=${this.loading}>
					${this.loading ? "Loading..." : "Refresh"}
				</button>
			</div>

			<div class="grid">
				<div class="card">
					<h2>System</h2>
					<div class="stat-row">
						<span>Gateway Uptime</span>
						<span>${this.formatUptime(this.data.gatewayUptime)}</span>
					</div>
					<div class="stat-row">
						<span>Memory Usage</span>
						<span>${this.data.memoryUsageMb.toFixed(1)} MB</span>
					</div>
					<div class="stat-row">
						<span>Active Sessions</span>
						<span>${this.data.sessions.length}</span>
					</div>
				</div>

				<div class="card">
					<h2>Channels (${this.data.channels.length})</h2>
					${
            this.data.channels.length === 0
              ? html`
                  <div class="empty-state">No channels connected</div>
                `
              : this.data.channels.map(
                  (ch) => html`
									<div class="stat-row">
										<span>
											<span class="status-dot status-${ch.status}"></span>
											${ch.name}
										</span>
										<span>${ch.status}</span>
									</div>
								`,
                )
          }
				</div>

				<div class="card">
					<h2>Plugins (${this.data.plugins.length})</h2>
					${
            this.data.plugins.length === 0
              ? html`
                  <div class="empty-state">No plugins loaded</div>
                `
              : this.data.plugins.map(
                  (p) => html`
									<div class="stat-row">
										<span>
											<span class="status-dot ${p.enabled ? "status-connected" : "status-disconnected"}"></span>
											${p.name}
										</span>
										<span>v${p.version}</span>
									</div>
								`,
                )
          }
				</div>

				<div class="card">
					<h2>Sessions</h2>
					${
            this.data.sessions.length === 0
              ? html`
                  <div class="empty-state">No active sessions</div>
                `
              : this.data.sessions.map(
                  (s) => html`
									<div class="stat-row">
										<span>${s.channel} - ${s.id.slice(0, 8)}</span>
										<span>${s.messageCount} msgs</span>
									</div>
								`,
                )
          }
				</div>
			</div>
		`;
  }
}

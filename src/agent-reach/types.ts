/**
 * Agent Reach type definitions.
 */

export interface AgentReachPlatform {
  /** Machine-readable name (e.g., "youtube", "twitter") */
  name: string;
  /** Human-readable label (e.g., "YouTube", "Twitter/X") */
  label: string;
  /** Availability status */
  status: "ok" | "warn" | "off" | "error";
  /** Status message or instructions */
  message: string;
  /** Upstream tool backends (e.g., ["yt-dlp"], ["xreach"]) */
  backends: string[];
  /** Tier: 0=zero-config, 1=needs free key/proxy, 2=needs setup */
  tier: number;
}

export interface AgentReachStatus {
  installed: boolean;
  platforms: AgentReachPlatform[];
  availableCount: number;
  totalCount: number;
}

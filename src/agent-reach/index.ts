/**
 * Agent Reach — Internet access tools for AI agents.
 *
 * Provides native TypeScript platform availability checks and
 * integrates with OpenClaw's skill system, admin API, and CLI.
 */
export { runDoctor, formatDoctorReport } from "./doctor.js";
export { extendedPythonPath } from "./extended-path.js";
export { PLATFORMS } from "./platforms.js";
export type { AgentReachPlatform, AgentReachStatus } from "./types.js";

import type { WizardSession } from "../wizard/session.js";

/** Max age for any wizard session (24 hours). */
const WIZARD_SESSION_TTL_MS = 24 * 60 * 60_000;
/** Max age for a "running" wizard session before assuming it crashed (1 hour). */
const WIZARD_SESSION_RUNNING_TTL_MS = 60 * 60_000;

export type TrackedWizardSession = {
  session: WizardSession;
  createdAt: number;
};

export function createWizardSessionTracker() {
  const wizardSessions = new Map<string, TrackedWizardSession>();

  const findRunningWizard = (): string | null => {
    for (const [id, tracked] of wizardSessions) {
      if (tracked.session.getStatus() === "running") {
        return id;
      }
    }
    return null;
  };

  const purgeWizardSession = (id: string) => {
    const tracked = wizardSessions.get(id);
    if (!tracked) {
      return;
    }
    if (tracked.session.getStatus() === "running") {
      return;
    }
    wizardSessions.delete(id);
  };

  /** Remove stale wizard sessions (called periodically from maintenance timer). */
  const cleanupWizardSessions = () => {
    const now = Date.now();
    for (const [id, tracked] of wizardSessions) {
      const age = now - tracked.createdAt;
      if (age > WIZARD_SESSION_TTL_MS) {
        wizardSessions.delete(id);
        continue;
      }
      if (tracked.session.getStatus() === "running" && age > WIZARD_SESSION_RUNNING_TTL_MS) {
        wizardSessions.delete(id);
      }
    }
  };

  return { wizardSessions, findRunningWizard, purgeWizardSession, cleanupWizardSessions };
}

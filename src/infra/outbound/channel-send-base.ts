/**
 * Base class and shared types for channel send operations.
 *
 * Each messaging channel (Signal, Telegram, Discord, Slack, iMessage, LINE)
 * follows a common pattern when sending messages:
 *   1. Parse a raw target string into a channel-specific target object.
 *   2. Resolve account configuration and credentials.
 *   3. Resolve media URLs into local attachments with size limits.
 *   4. Generate a placeholder message when sending media without text.
 *   5. Format/convert markdown text for the target channel.
 *   6. Resolve the maximum media byte size from opts → account config → defaults.
 *
 * This module extracts those shared concerns so individual channel adapters
 * only need to implement channel-specific behavior.
 *
 * Refactored channels:
 *   - Signal (fully migrated)
 *   - Telegram (partially migrated — loadCfg, resolveTableMode, resolveMaxBytes;
 *     media uses loadWebMedia so resolveMedia not applicable; retry/format/
 *     chunking logic remains channel-side)
 *   - Discord (partially migrated — loadCfg, resolveTableMode, resolveMaxBytes;
 *     media uses loadWebMediaRaw so resolveMedia not applicable; webhook/
 *     component/embed/forum logic remains channel-side)
 *   - Slack (partially migrated — loadCfg, resolveTableMode; media uses
 *     3-step file upload with loadWebMedia so resolveMedia/resolveMaxBytes
 *     not applicable; blocks/identity/thread logic remains channel-side)
 *   - iMessage (partially migrated — loadCfg, resolveTableMode, resolveMaxBytes;
 *     uses custom resolveAttachmentImpl injection so resolveMedia not applicable;
 *     reply-tag prepending, RPC client lifecycle remain channel-side)
 *   - LINE (partially migrated — loadCfg; media sends URLs directly to LINE API
 *     so resolveMedia/resolveMaxBytes not applicable; push/reply mode, flex/
 *     template/location messages, quick replies, loading animation, profile
 *     cache remain channel-side)
 */

import type { OpenClawConfig } from "../../config/config.js";
import { loadConfig } from "../../config/config.js";
import { resolveMarkdownTableMode } from "../../config/markdown-tables.js";
import type { MarkdownTableMode } from "../../config/types.base.js";
import type { MediaKind } from "../../media/constants.js";
import { kindFromMime } from "../../media/mime.js";
import { resolveOutboundAttachmentFromUrl } from "../../media/outbound-attachment.js";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

/** Result of resolving an outbound media attachment. */
export type ResolvedAttachment = {
  path: string;
  contentType?: string;
};

/** Common options shared by all channel send operations. */
export interface ChannelSendBaseOptions {
  cfg?: OpenClawConfig;
  accountId?: string;
  mediaUrl?: string;
  mediaLocalRoots?: readonly string[];
  maxBytes?: number;
}

/** The result of resolving media, including an optional placeholder message. */
export type MediaResolution = {
  attachment: ResolvedAttachment;
  /** A placeholder message generated when no text was provided (e.g. `<media:image>`). */
  placeholderText?: string;
};

// ---------------------------------------------------------------------------
// ChannelSendBase
// ---------------------------------------------------------------------------

/**
 * Abstract base class for channel send operations.
 *
 * Subclasses override channel-specific behavior (target parsing, text
 * formatting, text chunking) while inheriting common media resolution,
 * max-bytes calculation, and placeholder generation.
 */
export abstract class ChannelSendBase {
  /** Default max media bytes when no config is provided (8 MiB). */
  static readonly DEFAULT_MAX_BYTES = 8 * 1024 * 1024;

  // -----------------------------------------------------------------------
  // Abstract methods — subclasses must implement
  // -----------------------------------------------------------------------

  /** The channel identifier (e.g. "signal", "telegram"). */
  abstract readonly channelId: string;

  // -----------------------------------------------------------------------
  // Shared helpers — public so channel-specific module-level send functions
  // can call them on their singleton adapter instance.
  // -----------------------------------------------------------------------

  /**
   * Resolve the maximum media byte size from explicit opts, account-level
   * config, global agent defaults, or the class-level default.
   *
   * Resolution order (first defined wins):
   *   1. `opts.maxBytes`
   *   2. `accountMediaMaxMb * 1024 * 1024`
   *   3. `cfg.agents.defaults.mediaMaxMb * 1024 * 1024`
   *   4. `ChannelSendBase.DEFAULT_MAX_BYTES`
   */
  resolveMaxBytes(params: {
    explicitMaxBytes?: number;
    accountMediaMaxMb?: number;
    cfg: OpenClawConfig;
  }): number {
    if (typeof params.explicitMaxBytes === "number") {
      return params.explicitMaxBytes;
    }
    if (typeof params.accountMediaMaxMb === "number") {
      return params.accountMediaMaxMb * 1024 * 1024;
    }
    if (typeof params.cfg.agents?.defaults?.mediaMaxMb === "number") {
      return params.cfg.agents.defaults.mediaMaxMb * 1024 * 1024;
    }
    return ChannelSendBase.DEFAULT_MAX_BYTES;
  }

  /**
   * Resolve a media URL to a local file path suitable for channel APIs.
   *
   * When the caller provides no message text, a placeholder like
   * `<media:image>` is generated so the channel API receives a non-empty body.
   */
  async resolveMedia(
    mediaUrl: string,
    maxBytes: number,
    options?: { localRoots?: readonly string[]; existingText?: string },
  ): Promise<MediaResolution | null> {
    const trimmed = mediaUrl.trim();
    if (!trimmed) {
      return null;
    }

    const resolved = await resolveOutboundAttachmentFromUrl(trimmed, maxBytes, {
      localRoots: options?.localRoots,
    });

    // Generate a placeholder when the caller has no text at all (empty string).
    // Uses a falsy check (not .trim()) to match the original channel behavior:
    // whitespace-only text is considered "has text" and skips placeholder generation.
    let placeholderText: string | undefined;
    if (!options?.existingText) {
      const kind: MediaKind | undefined = kindFromMime(resolved.contentType ?? undefined);
      if (kind) {
        placeholderText = kind === "image" ? "<media:image>" : `<media:${kind}>`;
      }
    }

    return {
      attachment: resolved,
      placeholderText,
    };
  }

  /**
   * Resolve the markdown table rendering mode for this channel + account.
   */
  resolveTableMode(params: { cfg: OpenClawConfig; accountId?: string }): MarkdownTableMode {
    return resolveMarkdownTableMode({
      cfg: params.cfg,
      channel: this.channelId,
      accountId: params.accountId,
    });
  }

  /**
   * Load the global OpenClaw config, preferring an explicit override.
   */
  loadCfg(explicit?: OpenClawConfig): OpenClawConfig {
    return explicit ?? loadConfig();
  }
}

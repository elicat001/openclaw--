/**
 * Platform definitions for Agent Reach.
 *
 * Each platform declares what upstream tools it needs and how to check availability.
 */

export interface PlatformDef {
  name: string;
  label: string;
  backends: string[];
  tier: number;
  /** Binaries to check on PATH */
  requiredBins: string[];
  /** If any of these bins exist, consider partially available */
  optionalBins?: string[];
  /** Python modules that must be importable (checked via python3 -c "import X") */
  requiredPyModules?: string[];
  /** Check description when unavailable */
  installHint: string;
}

export const PLATFORMS: PlatformDef[] = [
  // Tier 0: zero-config
  {
    name: "web",
    label: "Web (Jina Reader)",
    backends: ["curl"],
    tier: 0,
    requiredBins: ["curl"],
    installHint: "curl is typically pre-installed on all systems.",
  },
  {
    name: "youtube",
    label: "YouTube",
    backends: ["yt-dlp"],
    tier: 0,
    requiredBins: ["yt-dlp"],
    installHint: "brew install yt-dlp  or  pip install yt-dlp",
  },
  {
    name: "github",
    label: "GitHub",
    backends: ["gh"],
    tier: 0,
    requiredBins: ["gh"],
    installHint: "brew install gh  or  https://cli.github.com/",
  },
  {
    name: "rss",
    label: "RSS/Atom",
    backends: ["feedparser"],
    tier: 0,
    requiredBins: ["python3"],
    requiredPyModules: ["feedparser"],
    installHint: "pip3 install feedparser",
  },
  {
    name: "exa",
    label: "Exa Search",
    backends: ["mcporter"],
    tier: 0,
    requiredBins: ["mcporter"],
    installHint: "npm install -g mcporter && mcporter config add exa https://mcp.exa.ai/mcp",
  },
  // Tier 1: needs free key or proxy
  {
    name: "twitter",
    label: "Twitter/X",
    backends: ["xreach"],
    tier: 1,
    requiredBins: ["xreach"],
    installHint: "npm install -g xreach-cli && xreach auth login",
  },
  {
    name: "bilibili",
    label: "Bilibili / B站",
    backends: ["yt-dlp"],
    tier: 1,
    requiredBins: ["yt-dlp"],
    installHint: "brew install yt-dlp  (server may need proxy for Bilibili)",
  },
  {
    name: "reddit",
    label: "Reddit",
    backends: ["curl"],
    tier: 1,
    requiredBins: ["curl"],
    installHint: "Server IPs may get 403. Use Exa search or configure proxy.",
  },
  {
    name: "weibo",
    label: "Weibo / 微博",
    backends: ["mcporter"],
    tier: 1,
    requiredBins: ["mcporter"],
    installHint:
      "pip install mcp-server-weibo && mcporter config add weibo --command 'mcp-server-weibo'",
  },
  {
    name: "xiaoyuzhou",
    label: "Xiaoyuzhou / 小宇宙",
    backends: ["ffmpeg"],
    tier: 1,
    requiredBins: ["ffmpeg"],
    installHint: "brew install ffmpeg  (also needs Groq API key for Whisper transcription)",
  },
  {
    name: "scrapling",
    label: "Scrapling (Stealth Scraping)",
    backends: ["scrapling"],
    tier: 1,
    requiredBins: ["python3"],
    requiredPyModules: ["scrapling"],
    installHint: 'pip3 install "scrapling[all]" && scrapling install',
  },
  // Tier 2: needs Docker, cookies, or complex setup
  {
    name: "xiaohongshu",
    label: "XiaoHongShu / 小红书",
    backends: ["mcporter", "docker"],
    tier: 2,
    requiredBins: ["mcporter"],
    optionalBins: ["docker"],
    installHint:
      "Needs Docker + mcporter + xiaohongshu-mcp. See: https://github.com/xpzouying/xiaohongshu-mcp",
  },
  {
    name: "douyin",
    label: "Douyin / 抖音",
    backends: ["mcporter"],
    tier: 2,
    requiredBins: ["mcporter"],
    installHint:
      "pip install douyin-mcp-server && mcporter config add douyin http://localhost:18070/mcp",
  },
  {
    name: "wechat",
    label: "WeChat / 微信公众号",
    backends: ["camoufox", "miku_ai"],
    tier: 2,
    requiredBins: ["python3"],
    requiredPyModules: ["camoufox", "miku_ai"],
    installHint: "pip3 install camoufox[geoip] markdownify beautifulsoup4 miku_ai",
  },
  {
    name: "linkedin",
    label: "LinkedIn",
    backends: ["curl"],
    tier: 2,
    requiredBins: [],
    optionalBins: ["mcporter", "curl"],
    installHint: "Basic: curl via Jina Reader. Full: pip install linkedin-scraper-mcp",
  },
  {
    name: "bosszhipin",
    label: "Boss直聘",
    backends: ["curl"],
    tier: 2,
    requiredBins: [],
    optionalBins: ["mcporter", "curl"],
    installHint: "Basic: curl via Jina Reader. Full: https://github.com/mucsbr/mcp-bosszp",
  },
];

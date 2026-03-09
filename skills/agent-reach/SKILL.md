---
name: agent-reach
description: "Internet access for AI agents: read/search/interact with 15+ platforms — Twitter/X, YouTube, Bilibili, Reddit, GitHub, XiaoHongShu (小红书), Douyin (抖音), WeChat Articles (微信公众号), Weibo (微博), LinkedIn, Boss直聘, RSS, Exa web search, and any web page. Use when: (1) user asks to search/read any of these platforms, (2) user shares a URL from a supported platform, (3) user asks to search the web or research a topic, (4) user asks to post/comment/interact on supported platforms. Triggers: 搜推特, 搜小红书, 看视频, 搜一下, 上网搜, 帮我查, 全网搜索, search twitter, youtube transcript, search reddit, read this link, B站, 抖音, 微信文章, 公众号, LinkedIn, RSS, web search."
metadata:
  {
    "openclaw":
      {
        "emoji": "🌐",
        "requires": { "anyBins": ["curl", "yt-dlp", "xreach", "gh", "mcporter"] },
        "install":
          [
            {
              "id": "yt-dlp",
              "kind": "brew",
              "formula": "yt-dlp",
              "bins": ["yt-dlp"],
              "label": "Install yt-dlp (YouTube/Bilibili)",
            },
            {
              "id": "xreach",
              "kind": "node",
              "package": "xreach-cli",
              "bins": ["xreach"],
              "label": "Install xreach (Twitter/X)",
            },
            {
              "id": "mcporter",
              "kind": "node",
              "package": "mcporter",
              "bins": ["mcporter"],
              "label": "Install mcporter (MCP tool bridge)",
            },
          ],
      },
  }
---

# Agent Reach — Internet Access Tools

Upstream tools for 15+ platforms. Call them directly via shell commands.

Run `openclaw agent-reach doctor` to check which platforms are available.

## Workspace Rules

**Never create files in the agent workspace.** Use `/tmp/` for temporary output and `~/.agent-reach/` for persistent data.

## Web — Any URL

```bash
curl -s "https://r.jina.ai/URL"
```

Returns clean Markdown of any web page. No API key needed.

## Web Search (Exa)

```bash
mcporter call 'exa.web_search_exa(query: "query", numResults: 5)'
mcporter call 'exa.get_code_context_exa(query: "code question", tokensNum: 3000)'
```

AI-powered semantic search. Free, no API key. Requires mcporter + Exa MCP config.

## Twitter/X (xreach)

```bash
xreach search "query" -n 10 --json          # search tweets
xreach tweet URL_OR_ID --json                # read single tweet
xreach tweets @username -n 20 --json         # user timeline
xreach thread URL_OR_ID --json               # full thread
```

Requires Cookie auth. Configure with: `xreach auth login`

## YouTube (yt-dlp)

```bash
yt-dlp --dump-json "URL"                     # video metadata + auto subtitles
yt-dlp --write-sub --write-auto-sub --sub-lang "zh-Hans,zh,en" --skip-download -o "/tmp/%(id)s" "URL"
                                             # download subtitles, then read .vtt file
yt-dlp --dump-json "ytsearch5:query"         # search YouTube
```

## Bilibili / B站 (yt-dlp)

```bash
yt-dlp --dump-json "https://www.bilibili.com/video/BVxxx"
yt-dlp --write-sub --write-auto-sub --sub-lang "zh-Hans,zh,en" --convert-subs vtt --skip-download -o "/tmp/%(id)s" "URL"
```

> Server IPs may get 412. Use `--cookies-from-browser chrome` or configure proxy.

## Reddit

```bash
curl -s "https://www.reddit.com/r/SUBREDDIT/hot.json?limit=10" -H "User-Agent: agent-reach/1.0"
curl -s "https://www.reddit.com/search.json?q=QUERY&limit=10" -H "User-Agent: agent-reach/1.0"
```

> Server IPs may get 403. Use Exa search as alternative, or configure proxy.

## GitHub (gh CLI)

```bash
gh search repos "query" --sort stars --limit 10
gh repo view owner/repo
gh search code "query" --language python
gh issue list -R owner/repo --state open
gh issue view 123 -R owner/repo
```

## XiaoHongShu / 小红书 (mcporter)

```bash
mcporter call 'xiaohongshu.search_feeds(keyword: "query")'
mcporter call 'xiaohongshu.get_feed_detail(feed_id: "xxx", xsec_token: "yyy")'
mcporter call 'xiaohongshu.get_feed_detail(feed_id: "xxx", xsec_token: "yyy", load_all_comments: true)'
mcporter call 'xiaohongshu.publish_content(title: "标题", content: "正文", images: ["/path/img.jpg"], tags: ["tag"])'
```

> Requires Docker + Cookie login. Use Cookie-Editor browser extension to export cookies.

## Douyin / 抖音 (mcporter)

```bash
mcporter call 'douyin.parse_douyin_video_info(share_link: "https://v.douyin.com/xxx/")'
mcporter call 'douyin.get_douyin_download_link(share_link: "https://v.douyin.com/xxx/")'
```

> No login needed. Requires mcporter + douyin-mcp-server.

## WeChat Articles / 微信公众号

**Search** (miku_ai):

```python
python3 -c "
import asyncio
from miku_ai import get_wexin_article
async def s():
    for a in await get_wexin_article('query', 5):
        print(f'{a[\"title\"]} | {a[\"url\"]}')
asyncio.run(s())
"
```

**Read** (Camoufox — bypasses WeChat anti-bot):

```bash
cd ~/.agent-reach/tools/wechat-article-for-ai && python3 main.py "https://mp.weixin.qq.com/s/ARTICLE_ID"
```

> WeChat articles cannot be read with Jina Reader or curl. Must use Camoufox.

## Weibo / 微博 (mcporter)

```bash
mcporter call 'weibo.get_hot_searches()'
mcporter call 'weibo.search_content(keyword: "query", count: 10)'
mcporter call 'weibo.search_users(keyword: "name", count: 10)'
mcporter call 'weibo.get_user_timeline(uid: "user_id", count: 10)'
```

## LinkedIn (mcporter)

```bash
mcporter call 'linkedin.get_person_profile(linkedin_url: "https://linkedin.com/in/username")'
mcporter call 'linkedin.search_people(keyword: "AI engineer", limit: 10)'
```

Fallback: `curl -s "https://r.jina.ai/https://linkedin.com/in/username"`

## Boss直聘 (mcporter)

```bash
mcporter call 'bosszhipin.get_recommend_jobs_tool(page: 1)'
mcporter call 'bosszhipin.search_jobs_tool(keyword: "Python", city: "北京")'
```

Fallback: `curl -s "https://r.jina.ai/https://www.zhipin.com/job_detail/xxx"`

## RSS

```python
python3 -c "
import feedparser
for e in feedparser.parse('FEED_URL').entries[:5]:
    print(f'{e.title} — {e.link}')
"
```

## Xiaoyuzhou Podcast / 小宇宙播客

```bash
# Requires ffmpeg + Groq Whisper API
ffmpeg -i "AUDIO_URL" -f segment -segment_time 300 /tmp/segment_%03d.mp3
# Then transcribe each segment via Groq Whisper
```

## Troubleshooting

- **Channel not working?** Run `openclaw agent-reach doctor` for status and fix instructions.
- **Twitter fetch failed?** Ensure `undici` is installed: `npm install -g undici`.
- **Bilibili 412?** Use `--cookies-from-browser chrome` or set proxy.
- **Reddit 403?** Use Exa web search instead, or configure a residential proxy.

## Setting Up a Channel ("帮我配 XXX")

If a channel needs setup (cookies, Docker, etc.), fetch the upstream install guide:
https://raw.githubusercontent.com/Panniantong/agent-reach/main/docs/install.md

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const PLATFORMS = [
  { id: "amazon-us", label: "Amazon US" },
  { id: "amazon-br", label: "Amazon BR" },
  { id: "meli", label: "Mercado Livre" },
];

export function CrawlForm() {
  const router = useRouter();
  const [keyword, setKeyword] = useState("");
  const [platforms, setPlatforms] = useState(["amazon-us", "amazon-br"]);
  const [max, setMax] = useState(50);
  const [loading, setLoading] = useState(false);

  const togglePlatform = (id: string) => {
    setPlatforms((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };

  const submit = async () => {
    if (!keyword.trim() || platforms.length === 0) return;
    setLoading(true);

    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "crawl",
        params: { keyword: keyword.trim(), platforms, max },
      }),
    });

    const data = await res.json();
    router.push(`/crawl/${data.id}`);
  };

  return (
    <div className="bg-white border rounded-lg p-6 max-w-lg">
      <h2 className="text-lg font-bold mb-4">启动爬虫任务</h2>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">产品关键词</label>
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="例: triangle mop foldable"
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">平台</label>
        <div className="flex gap-2">
          {PLATFORMS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => togglePlatform(p.id)}
              className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                platforms.includes(p.id)
                  ? "bg-blue-50 border-blue-400 text-blue-700"
                  : "bg-gray-50 border-gray-300 text-gray-500"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          每平台最大产品数: {max}
        </label>
        <input
          type="range"
          min={10}
          max={100}
          step={10}
          value={max}
          onChange={(e) => setMax(parseInt(e.target.value))}
          className="w-full"
        />
      </div>

      <button
        onClick={submit}
        disabled={loading || !keyword.trim() || platforms.length === 0}
        className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? "启动中..." : "开始爬取"}
      </button>
    </div>
  );
}

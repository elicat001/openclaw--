"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const CATEGORIES = [
  { id: "home", label: "家居 Home" },
  { id: "kitchen", label: "厨房 Kitchen" },
  { id: "baby", label: "母婴 Baby" },
  { id: "beauty", label: "美妆 Beauty" },
  { id: "tools", label: "工具 Tools" },
  { id: "toys", label: "玩具 Toys" },
  { id: "sports", label: "运动 Sports" },
  { id: "pet", label: "宠物 Pet" },
  { id: "electronics", label: "电子 Electronics" },
  { id: "office", label: "办公 Office" },
];

export function DiscoverForm() {
  const router = useRouter();
  const [category, setCategory] = useState("home");
  const [maxKeywords, setMaxKeywords] = useState(10);
  const [maxPerKeyword, setMaxPerKeyword] = useState(50);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "discover",
        params: { category, maxKeywords, maxPerKeyword },
      }),
    });
    const data = await res.json();
    router.push(`/discover/${data.id}`);
  };

  return (
    <div className="bg-white border rounded-lg p-6 max-w-lg">
      <h2 className="text-lg font-bold mb-4">品类自动发现</h2>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">品类</label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          最大关键词数: {maxKeywords}
        </label>
        <input
          type="range"
          min={3}
          max={20}
          value={maxKeywords}
          onChange={(e) => setMaxKeywords(parseInt(e.target.value))}
          className="w-full"
        />
      </div>

      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          每关键词产品数: {maxPerKeyword}
        </label>
        <input
          type="range"
          min={20}
          max={100}
          step={10}
          value={maxPerKeyword}
          onChange={(e) => setMaxPerKeyword(parseInt(e.target.value))}
          className="w-full"
        />
      </div>

      <button
        onClick={submit}
        disabled={loading}
        className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? "启动中..." : "开始发现"}
      </button>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type ReportItem = {
  id: string;
  type: string;
  title: string;
  keyword: string | null;
  category: string | null;
  createdAt: string;
};

const TYPE_BADGES: Record<string, { label: string; color: string }> = {
  discovery: { label: "品类发现", color: "bg-green-100 text-green-700" },
  opportunity: { label: "选品分析", color: "bg-blue-100 text-blue-700" },
  "market-analysis": { label: "市场分析", color: "bg-purple-100 text-purple-700" },
};

export default function ReportsPage() {
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const params = search ? `?search=${encodeURIComponent(search)}` : "";
    fetch(`/api/reports${params}`)
      .then((r) => r.json())
      .then((d) => setReports(d.reports || []));
  }, [search]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">报告</h1>

      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索报告..."
          className="w-full max-w-md border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="space-y-2">
        {reports.length === 0 ? (
          <p className="text-gray-400 text-sm">暂无报告</p>
        ) : (
          reports.map((report) => {
            const badge = TYPE_BADGES[report.type] || TYPE_BADGES["market-analysis"];
            return (
              <Link
                key={report.id}
                href={`/reports/${report.id}`}
                className="block border rounded-lg p-4 bg-white hover:border-blue-400 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.color}`}>
                      {badge.label}
                    </span>
                    <span className="font-medium text-sm">{report.title}</span>
                  </div>
                  <span className="text-xs text-gray-400">
                    {new Date(report.createdAt).toLocaleString("zh-CN")}
                  </span>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";

type Job = {
  id: string;
  type: string;
  status: string;
  params: string;
  progress: number | null;
  currentStep: string | null;
  createdAt: string | number;
};

const STATUS_BADGES: Record<string, { label: string; color: string }> = {
  pending: { label: "等待中", color: "bg-yellow-100 text-yellow-800" },
  running: { label: "运行中", color: "bg-blue-100 text-blue-800" },
  done: { label: "完成", color: "bg-green-100 text-green-800" },
  failed: { label: "失败", color: "bg-red-100 text-red-800" },
  cancelled: { label: "已取消", color: "bg-gray-100 text-gray-800" },
};

const TYPE_LABELS: Record<string, string> = {
  crawl: "爬虫",
  discover: "品类发现",
  pipeline: "全流程",
};

export function JobCard({ job }: { job: Job }) {
  const badge = STATUS_BADGES[job.status] || STATUS_BADGES.pending;
  const params = JSON.parse(job.params);
  const detailHref = job.type === "discover" ? `/discover/${job.id}` : `/crawl/${job.id}`;

  return (
    <Link href={detailHref} className="block">
      <div className="border rounded-lg p-4 hover:border-blue-400 transition-colors bg-white">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500">
              {TYPE_LABELS[job.type] || job.type}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.color}`}>
              {badge.label}
            </span>
          </div>
          <span className="text-xs text-gray-400">
            {new Date(job.createdAt).toLocaleString("zh-CN")}
          </span>
        </div>

        <p className="font-medium text-sm mb-2">
          {params.keyword || params.category || job.id.slice(0, 8)}
        </p>

        {job.status === "running" && (
          <>
            <div className="w-full bg-gray-200 rounded-full h-2 mb-1">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${job.progress || 0}%` }}
              />
            </div>
            <p className="text-xs text-gray-500">
              {job.currentStep || "准备中..."} ({job.progress || 0}%)
            </p>
          </>
        )}
      </div>
    </Link>
  );
}

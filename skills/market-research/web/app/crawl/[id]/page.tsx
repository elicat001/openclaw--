"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { JobLog } from "@/components/job-log";

type Job = {
  id: string;
  type: string;
  status: string;
  params: string;
  progress: number | null;
  currentStep: string | null;
  reportId: string | null;
  createdAt: string;
};

export default function CrawlDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [job, setJob] = useState<Job | null>(null);

  useEffect(() => {
    fetch(`/api/jobs/${id}`)
      .then((r) => r.json())
      .then(setJob);
  }, [id]);

  if (!job) {
    return <div className="text-gray-400 text-sm animate-pulse">加载中...</div>;
  }

  const params = JSON.parse(job.params);

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/crawl" className="text-gray-400 hover:text-gray-600">
          ← 返回
        </Link>
        <h1 className="text-2xl font-bold">
          {params.keyword || params.category || job.id.slice(0, 8)}
        </h1>
        <span className="text-sm text-gray-500">
          {job.type === "discover" ? "品类发现" : "爬虫任务"}
        </span>
      </div>

      <JobLog jobId={id} />

      {job.reportId && (
        <div className="mt-4">
          <Link
            href={`/reports/${job.reportId}`}
            className="inline-block bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
          >
            查看报告
          </Link>
        </div>
      )}
    </div>
  );
}

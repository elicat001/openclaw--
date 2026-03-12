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

export default function DiscoverDetailPage() {
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
        <Link href="/discover" className="text-gray-400 hover:text-gray-600">
          ← 返回
        </Link>
        <h1 className="text-2xl font-bold">品类发现: {params.category}</h1>
      </div>

      <div className="mb-4 flex gap-4 text-sm text-gray-500">
        <span>最大关键词: {params.maxKeywords || 10}</span>
        <span>每关键词产品: {params.maxPerKeyword || 50}</span>
      </div>

      <JobLog jobId={id} />

      {job.reportId && (
        <div className="mt-4">
          <Link
            href={`/reports/${job.reportId}`}
            className="inline-block bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
          >
            查看发现报告
          </Link>
        </div>
      )}
    </div>
  );
}

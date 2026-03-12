"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ReportViewer } from "@/components/report-viewer";

export default function ReportDetailPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/reports" className="text-gray-400 hover:text-gray-600">
          ← 返回
        </Link>
        <h1 className="text-2xl font-bold">报告详情</h1>
      </div>

      <div className="bg-white border rounded-lg p-6">
        <ReportViewer reportId={id} />
      </div>
    </div>
  );
}

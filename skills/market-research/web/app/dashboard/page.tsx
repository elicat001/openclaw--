"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { JobCard } from "@/components/job-card";
import { StatsCards } from "@/components/stats-cards";

type Job = {
  id: string;
  type: string;
  status: string;
  params: string;
  progress: number | null;
  currentStep: string | null;
  createdAt: string;
};

type ReportItem = {
  id: string;
  type: string;
  title: string;
  keyword: string | null;
  category: string | null;
  createdAt: string;
};

export default function DashboardPage() {
  const [recentJobs, setRecentJobs] = useState<Job[]>([]);
  const [recentReports, setRecentReports] = useState<ReportItem[]>([]);

  useEffect(() => {
    const load = () => {
      fetch("/api/jobs?limit=5")
        .then((r) => r.json())
        .then((d) => setRecentJobs(d.jobs || []))
        .catch(() => {});
      fetch("/api/reports?limit=5")
        .then((r) => r.json())
        .then((d) => setRecentReports(d.reports || []))
        .catch(() => {});
    };
    load();
    const timer = setInterval(load, 15_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">控制台</h1>

      <StatsCards />

      <div className="grid md:grid-cols-2 gap-6 mt-6">
        {/* Recent Jobs */}
        <div>
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-semibold">最近任务</h2>
            <Link href="/crawl" className="text-sm text-blue-600 hover:underline">
              查看全部
            </Link>
          </div>
          <div className="space-y-2">
            {recentJobs.length === 0 ? (
              <p className="text-gray-400 text-sm">暂无任务</p>
            ) : (
              recentJobs.map((job) => <JobCard key={job.id} job={job} />)
            )}
          </div>
        </div>

        {/* Recent Reports */}
        <div>
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-semibold">最近报告</h2>
            <Link href="/reports" className="text-sm text-blue-600 hover:underline">
              查看全部
            </Link>
          </div>
          <div className="space-y-2">
            {recentReports.length === 0 ? (
              <p className="text-gray-400 text-sm">暂无报告</p>
            ) : (
              recentReports.map((report) => (
                <Link
                  key={report.id}
                  href={`/reports/${report.id}`}
                  className="block border rounded-lg p-3 bg-white hover:border-blue-400 transition-colors"
                >
                  <p className="font-medium text-sm">{report.title}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(report.createdAt).toLocaleString("zh-CN")}
                  </p>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mt-6">
        <h2 className="text-lg font-semibold mb-3">快速操作</h2>
        <div className="flex gap-3">
          <Link
            href="/crawl"
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            新建爬虫任务
          </Link>
          <Link
            href="/discover"
            className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
          >
            品类自动发现
          </Link>
        </div>
      </div>
    </div>
  );
}

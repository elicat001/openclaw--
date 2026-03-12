"use client";

import { useEffect, useState } from "react";
import { DiscoverForm } from "@/components/discover-form";
import { JobCard } from "@/components/job-card";

type Job = {
  id: string;
  type: string;
  status: string;
  params: string;
  progress: number | null;
  currentStep: string | null;
  createdAt: string;
};

export default function DiscoverPage() {
  const [jobs, setJobs] = useState<Job[]>([]);

  useEffect(() => {
    fetch("/api/jobs?type=discover&limit=20")
      .then((r) => r.json())
      .then((d) => setJobs(d.jobs || []));
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">品类自动发现</h1>

      <div className="grid md:grid-cols-2 gap-6">
        <DiscoverForm />

        <div>
          <h2 className="text-lg font-semibold mb-3">发现历史</h2>
          <div className="space-y-2">
            {jobs.length === 0 ? (
              <p className="text-gray-400 text-sm">暂无发现任务</p>
            ) : (
              jobs.map((job) => <JobCard key={job.id} job={job} />)
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

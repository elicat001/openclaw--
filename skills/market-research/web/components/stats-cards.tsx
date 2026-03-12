"use client";

import { useEffect, useState } from "react";

type Stats = {
  jobsThisWeek: number;
  runningJobs: number;
  totalReports: number;
  activeSchedules: number;
};

const CARDS = [
  { key: "jobsThisWeek" as const, label: "本周任务", icon: "📦" },
  { key: "runningJobs" as const, label: "运行中", icon: "⚡" },
  { key: "totalReports" as const, label: "报告总数", icon: "📄" },
  { key: "activeSchedules" as const, label: "定时任务", icon: "⏰" },
];

export function StatsCards() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then(setStats);
  }, []);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {CARDS.map((card) => (
        <div key={card.key} className="bg-white border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <span>{card.icon}</span>
            <span className="text-sm text-gray-500">{card.label}</span>
          </div>
          <p className="text-2xl font-bold">{stats ? stats[card.key] : "—"}</p>
        </div>
      ))}
    </div>
  );
}

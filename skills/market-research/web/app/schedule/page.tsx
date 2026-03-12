"use client";

import { useEffect, useState } from "react";

type Schedule = {
  id: string;
  name: string;
  type: string;
  params: string;
  cronExpr: string;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
};

const CRON_PRESETS = [
  { label: "每天凌晨 3 点", value: "0 3 * * *" },
  { label: "每天中午 12 点", value: "0 12 * * *" },
  { label: "每周一凌晨", value: "0 3 * * 1" },
  { label: "每 12 小时", value: "0 */12 * * *" },
];

const CATEGORIES = [
  "home",
  "kitchen",
  "baby",
  "beauty",
  "tools",
  "toys",
  "sports",
  "pet",
  "electronics",
  "office",
];

export default function SchedulePage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("home");
  const [cronExpr, setCronExpr] = useState("0 3 * * *");
  const [maxKeywords, setMaxKeywords] = useState(10);

  const loadSchedules = () => {
    fetch("/api/schedules")
      .then((r) => r.json())
      .then((d) => setSchedules(d.schedules || []));
  };

  useEffect(() => {
    loadSchedules();
  }, []);

  const createSchedule = async () => {
    await fetch("/api/schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        type: "discover",
        params: { category, maxKeywords, maxPerKeyword: 50 },
        cronExpr,
      }),
    });
    setShowForm(false);
    setName("");
    loadSchedules();
  };

  const toggleSchedule = async (id: string, enabled: boolean) => {
    await fetch(`/api/schedules/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !enabled }),
    });
    loadSchedules();
  };

  const deleteSchedule = async (id: string) => {
    await fetch(`/api/schedules/${id}`, { method: "DELETE" });
    loadSchedules();
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">定时任务</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          {showForm ? "取消" : "新建定时任务"}
        </button>
      </div>

      {showForm && (
        <div className="bg-white border rounded-lg p-6 mb-6 max-w-lg">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">任务名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: 每日家居扫描"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">品类</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">执行频率</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {CRON_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => setCronExpr(preset.value)}
                  className={`px-3 py-1 rounded-lg text-xs border ${
                    cronExpr === preset.value
                      ? "bg-blue-50 border-blue-400 text-blue-700"
                      : "bg-gray-50 border-gray-300"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={cronExpr}
              onChange={(e) => setCronExpr(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm font-mono"
              placeholder="Cron 表达式"
            />
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

          <button
            onClick={createSchedule}
            disabled={!name.trim()}
            className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            创建
          </button>
        </div>
      )}

      {/* Schedule list */}
      <div className="space-y-2">
        {schedules.length === 0 ? (
          <p className="text-gray-400 text-sm">暂无定时任务</p>
        ) : (
          schedules.map((s) => {
            const params = JSON.parse(s.params);
            return (
              <div
                key={s.id}
                className="border rounded-lg p-4 bg-white flex items-center justify-between"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`w-2 h-2 rounded-full ${s.enabled ? "bg-green-500" : "bg-gray-400"}`}
                    />
                    <span className="font-medium text-sm">{s.name}</span>
                    <span className="text-xs text-gray-500 font-mono">{s.cronExpr}</span>
                  </div>
                  <p className="text-xs text-gray-400">
                    品类: {params.category} | 关键词数: {params.maxKeywords}
                    {s.nextRunAt && ` | 下次执行: ${new Date(s.nextRunAt).toLocaleString("zh-CN")}`}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => toggleSchedule(s.id, s.enabled)}
                    className={`px-3 py-1 rounded text-xs font-medium ${
                      s.enabled
                        ? "bg-yellow-100 text-yellow-700 hover:bg-yellow-200"
                        : "bg-green-100 text-green-700 hover:bg-green-200"
                    }`}
                  >
                    {s.enabled ? "暂停" : "启用"}
                  </button>
                  <button
                    onClick={() => deleteSchedule(s.id)}
                    className="px-3 py-1 rounded text-xs font-medium bg-red-100 text-red-700 hover:bg-red-200"
                  >
                    删除
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

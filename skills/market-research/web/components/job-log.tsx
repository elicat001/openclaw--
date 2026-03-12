"use client";

import { useEffect, useRef, useState } from "react";

export function JobLog({ jobId }: { jobId: string }) {
  const [lines, setLines] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState("连接中...");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const eventSource = new EventSource(`/api/jobs/${jobId}/events`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.line) {
        setLines((prev) => [...prev.slice(-500), data.line]); // Keep last 500 lines
      }
      if (data.progress !== undefined) setProgress(data.progress);
      if (data.step) setStep(data.step);
      if (data.done) {
        setDone(true);
        eventSource.close();
      }
      if (data.error) setError(data.error);
    };

    eventSource.onerror = () => {
      setDone(true);
      eventSource.close();
    };

    return () => eventSource.close();
  }, [jobId]);

  // Auto-scroll
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [lines]);

  return (
    <div>
      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex justify-between text-sm mb-1">
          <span className="text-gray-600">{step}</span>
          <span className="font-mono text-gray-500">{progress}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className={`h-3 rounded-full transition-all duration-300 ${
              error ? "bg-red-500" : done ? "bg-green-500" : "bg-blue-500"
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-3 mb-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Terminal log */}
      <div
        ref={containerRef}
        className="bg-gray-900 text-gray-100 font-mono text-xs rounded-lg p-4 h-96 overflow-y-auto"
      >
        {lines.length === 0 && !done && <p className="text-gray-500 animate-pulse">等待输出...</p>}
        {lines.map((line, i) => (
          <div key={i} className="whitespace-pre-wrap leading-5">
            {line}
          </div>
        ))}
        {done && !error && <div className="text-green-400 mt-2 font-bold">✓ 任务完成</div>}
      </div>
    </div>
  );
}

"use client";

import { marked } from "marked";
import { useEffect, useState } from "react";

export function ReportViewer({ reportId }: { reportId: string }) {
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");

  useEffect(() => {
    fetch(`/api/reports/${reportId}`)
      .then((r) => r.json())
      .then((report) => {
        setTitle(report.title || "");
        setHtml(marked.parse(report.content || "") as string);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [reportId]);

  if (loading) {
    return <div className="text-gray-400 text-sm animate-pulse">加载报告中...</div>;
  }

  return (
    <div>
      {title && <h1 className="text-xl font-bold mb-4">{title}</h1>}
      <div
        className="prose prose-sm max-w-none prose-headings:text-gray-800 prose-table:text-sm"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

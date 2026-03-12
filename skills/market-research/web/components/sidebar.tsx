"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/dashboard", label: "控制台", icon: "📊" },
  { href: "/crawl", label: "爬虫", icon: "🕷️" },
  { href: "/discover", label: "发现", icon: "🔍" },
  { href: "/reports", label: "报告", icon: "📄" },
  { href: "/schedule", label: "定时任务", icon: "⏰" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 bg-gray-900 text-gray-100 min-h-screen flex flex-col">
      <div className="p-4 border-b border-gray-700">
        <h1 className="text-lg font-bold">Cross-Selector</h1>
        <p className="text-xs text-gray-400">跨境选品工具</p>
      </div>
      <nav className="flex-1 p-2">
        {NAV_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg mb-1 text-sm transition-colors ${
                active
                  ? "bg-blue-600 text-white"
                  : "text-gray-300 hover:bg-gray-800 hover:text-white"
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

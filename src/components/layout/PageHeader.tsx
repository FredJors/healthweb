"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { HeartPulse, Upload } from "lucide-react";
import { getLatestImport } from "@/modules/storage/db";
import { fmtDateFull } from "@/modules/analytics/format";

export default function PageHeader({ title }: { title: string }) {
  const latest = useLiveQuery(getLatestImport, []);

  return (
    <header className="mb-7 flex flex-wrap items-center gap-4">
      <h1 className="text-3xl font-extrabold tracking-tight text-ink">{title}</h1>

      {latest && (
        <span className="inline-flex items-center gap-2 rounded-full bg-card py-2 pr-4 pl-2 text-xs font-semibold text-ink-2 shadow-sm">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[linear-gradient(135deg,#f43f7f,#f95f39)]">
            <HeartPulse className="h-3.5 w-3.5 text-white" />
          </span>
          {latest.source === "demo" ? "Demo-Daten" : "Apple-Health-Export"}
          {latest.rangeEnd && ` · Stand ${fmtDateFull(latest.rangeEnd)}`}
        </span>
      )}

      <Link
        href="/import"
        className="ml-auto inline-flex items-center gap-2 rounded-full bg-sidebar px-5 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-85"
      >
        <Upload className="h-4 w-4" />
        Daten importieren
      </Link>
    </header>
  );
}

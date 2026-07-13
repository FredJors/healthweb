"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  FileUp,
  FlaskConical,
  Loader2,
  ShieldCheck,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { importAppleHealthExport } from "@/modules/ingestion/apple-health-export/import";
import type { ImportProgress, ImportSummary } from "@/modules/ingestion/types";
import { clearAllData } from "@/modules/storage/db";
import { loadDemoData } from "@/modules/demo/generate";
import PageHeader from "@/components/layout/PageHeader";
import Card, { CardTitle } from "@/components/ui/Card";
import { fmtDateFull, fmtInt } from "@/modules/analytics/format";

type State =
  | { kind: "idle" }
  | { kind: "running"; progress: ImportProgress }
  | { kind: "done"; summary: ImportSummary }
  | { kind: "error"; message: string };

export default function ImportPage() {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const runImport = useCallback(async (file: File) => {
    const name = file.name.toLowerCase();
    if (!name.endsWith(".zip") && !name.endsWith(".xml")) {
      setState({
        kind: "error",
        message:
          "Bitte die Export-Datei aus der Health-App hochladen (ZIP oder export.xml).",
      });
      return;
    }
    setState({
      kind: "running",
      progress: {
        phase: "reading",
        percent: 0,
        records: 0,
        workouts: 0,
        routes: 0,
        bytesRead: 0,
      },
    });
    try {
      const summary = await importAppleHealthExport(file, (progress) =>
        setState({ kind: "running", progress })
      );
      setState({ kind: "done", summary });
    } catch (e) {
      setState({
        kind: "error",
        message: e instanceof Error ? e.message : "Unbekannter Fehler beim Import.",
      });
    }
  }, []);

  const busy = state.kind === "running";

  return (
    <>
      <PageHeader title="Daten importieren" />

      <div className="grid grid-cols-12 gap-5">
        {/* Anleitung */}
        <div className="col-span-12 lg:col-span-5">
          <Card className="h-full">
            <CardTitle>So exportierst du deine Apple-Health-Daten</CardTitle>
            <ol className="flex flex-col gap-4 text-sm text-ink-2">
              {[
                <>
                  Öffne auf dem iPhone die <b>Health-App</b> und tippe oben
                  rechts auf dein <b>Profilbild</b>.
                </>,
                <>
                  Wähle ganz unten{" "}
                  <b>„Alle Gesundheitsdaten exportieren“</b> und bestätige. Das
                  Erstellen kann einige Minuten dauern.
                </>,
                <>
                  Teile die erzeugte <b>Export.zip</b> auf diesen Rechner (z. B.
                  per AirDrop, iCloud Drive oder E-Mail) und lade sie rechts
                  hoch — entpacken ist nicht nötig.
                </>,
              ].map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-extrabold text-accent">
                    {i + 1}
                  </span>
                  <span className="leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>

            <div className="mt-6 flex items-start gap-3 rounded-2xl bg-soft p-4 text-xs leading-relaxed text-ink-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-pos" />
              <span>
                <b>Datenschutz:</b> Die Datei wird direkt in deinem Browser
                verarbeitet und in einer lokalen Datenbank (IndexedDB)
                gespeichert. Es findet <b>kein Upload auf einen Server</b> statt.
              </span>
            </div>
          </Card>
        </div>

        {/* Upload */}
        <div className="col-span-12 flex flex-col gap-5 lg:col-span-7">
          <Card>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (busy) return;
                const file = e.dataTransfer.files?.[0];
                if (file) void runImport(file);
              }}
              className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
                dragOver ? "border-accent bg-accent-soft" : "border-hairline bg-soft/50"
              }`}
            >
              <FileUp className="h-8 w-8 text-ink-3" />
              <p className="mt-3 text-sm font-bold text-ink">
                Export.zip hierher ziehen
              </p>
              <p className="mt-1 text-xs text-ink-3">
                oder eine Datei auswählen (.zip oder export.xml) — auch große
                Exporte mit mehreren hundert MB funktionieren
              </p>
              <button
                onClick={() => inputRef.current?.click()}
                disabled={busy}
                className="mt-5 rounded-full bg-sidebar px-6 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-85 disabled:opacity-50"
              >
                Datei auswählen
              </button>
              <input
                ref={inputRef}
                type="file"
                accept=".zip,.xml"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void runImport(file);
                }}
              />
            </div>

            {state.kind === "running" && (
              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between text-xs font-semibold text-ink-2">
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {state.progress.phase === "reading"
                      ? "Lese und analysiere Export …"
                      : "Speichere in lokale Datenbank …"}
                  </span>
                  <span>
                    {fmtInt(state.progress.bytesRead / 1048576)} MB ·{" "}
                    {fmtInt(state.progress.records)} Einträge ·{" "}
                    {fmtInt(state.progress.workouts)} Workouts ·{" "}
                    {fmtInt(state.progress.routes)} Routen
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-accent-soft">
                  <div
                    className="h-full rounded-full bg-accent transition-[width] duration-200"
                    style={{ width: `${state.progress.percent}%` }}
                  />
                </div>
              </div>
            )}

            {state.kind === "done" && (
              <div className="mt-5 rounded-2xl bg-pos-soft p-5">
                <div className="flex items-center gap-2 text-sm font-extrabold text-pos">
                  <CheckCircle2 className="h-5 w-5" />
                  Import erfolgreich
                </div>
                <p className="mt-2 text-sm text-ink-2">
                  {fmtInt(state.summary.workouts)} Workouts,{" "}
                  {fmtInt(state.summary.metricDays)} Tage mit Messwerten,{" "}
                  {fmtInt(state.summary.sleepNights)} Schlafnächte und{" "}
                  {fmtInt(state.summary.routes)} GPS-Routen
                  {state.summary.rangeStart &&
                    state.summary.rangeEnd &&
                    ` (${fmtDateFull(state.summary.rangeStart)} – ${fmtDateFull(
                      state.summary.rangeEnd
                    )})`}
                  .
                </p>
                {state.summary.routes === 0 && (
                  <p className="mt-2 text-xs text-ink-3">
                    Hinweis: GPS-Routen stecken nur in der kompletten
                    Export-ZIP — beim Upload einer einzelnen export.xml fehlen
                    sie.
                  </p>
                )}
                <Link
                  href="/"
                  className="mt-4 inline-block rounded-full bg-sidebar px-6 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-85"
                >
                  Zum Dashboard
                </Link>
              </div>
            )}

            {state.kind === "error" && (
              <div className="mt-5 flex items-start gap-3 rounded-2xl bg-neg-soft p-5 text-sm text-neg">
                <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" />
                {state.message}
              </div>
            )}
          </Card>

          <Card className="flex flex-wrap items-center gap-4">
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold text-ink">Nur mal ausprobieren?</h3>
              <p className="mt-0.5 text-xs text-ink-3">
                Lädt 180 Tage realistische Demo-Daten — ersetzt vorhandene Daten.
              </p>
            </div>
            <button
              onClick={async () => {
                setState({
                  kind: "running",
                  progress: {
                    phase: "storing",
                    percent: 50,
                    records: 0,
                    workouts: 0,
                    routes: 0,
                    bytesRead: 0,
                  },
                });
                const summary = await loadDemoData();
                setState({ kind: "done", summary });
              }}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-full bg-soft px-5 py-2.5 text-sm font-bold text-ink transition-colors hover:bg-hairline disabled:opacity-50"
            >
              <FlaskConical className="h-4 w-4" />
              Demo-Daten laden
            </button>
            <button
              onClick={async () => {
                if (
                  window.confirm(
                    "Wirklich alle lokal gespeicherten Gesundheitsdaten löschen?"
                  )
                ) {
                  await clearAllData();
                  setState({ kind: "idle" });
                }
              }}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-full bg-neg-soft px-5 py-2.5 text-sm font-bold text-neg transition-opacity hover:opacity-80 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              Alle Daten löschen
            </button>
          </Card>
        </div>
      </div>
    </>
  );
}

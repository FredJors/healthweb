"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import Card, { CardTitle } from "@/components/ui/Card";
import {
  DEFAULT_MODEL,
  getApiKey,
  getModel,
  MODEL_OPTIONS,
  setApiKey,
  setModel,
} from "@/modules/nutrition/settings";
import { testApiKey } from "@/modules/nutrition/estimate";

type TestState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "ok" }
  | { kind: "error"; message: string };

export default function EinstellungenPage() {
  const [key, setKey] = useState("");
  const [model, setModelState] = useState<string>(DEFAULT_MODEL);
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [test, setTest] = useState<TestState>({ kind: "idle" });

  useEffect(() => {
    setKey(getApiKey() ?? "");
    setModelState(getModel());
  }, []);

  const save = () => {
    setApiKey(key);
    setModel(model);
    setSaved(true);
    setTest({ kind: "idle" });
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <>
      <PageHeader title="Einstellungen" />

      <div className="grid grid-cols-12 gap-5">
        <div className="col-span-12 lg:col-span-7">
          <Card>
            <CardTitle sub="Für die Kalorienschätzung von Essensfotos — optional, alles andere funktioniert ohne">
              KI-Schätzung (Anthropic-API)
            </CardTitle>

            <label className="mb-1 block text-xs font-semibold text-ink-3">
              Dein API-Key
            </label>
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <KeyRound className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-3" />
                <input
                  type={showKey ? "text" : "password"}
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="sk-ant-…"
                  spellCheck={false}
                  className="w-full rounded-xl border border-hairline bg-soft/50 py-2.5 pr-10 pl-9 font-mono text-sm text-ink outline-none focus:border-accent"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  title={showKey ? "Verbergen" : "Anzeigen"}
                  className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-ink-3 hover:text-ink"
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <label className="mt-4 mb-1 block text-xs font-semibold text-ink-3">
              Modell
            </label>
            <div className="flex flex-col gap-2">
              {MODEL_OPTIONS.map((m) => (
                <label
                  key={m.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-2.5 text-sm transition-colors ${
                    model === m.id
                      ? "border-accent bg-accent-soft"
                      : "border-hairline hover:bg-soft"
                  }`}
                >
                  <input
                    type="radio"
                    name="model"
                    checked={model === m.id}
                    onChange={() => setModelState(m.id)}
                    className="accent-[#e0446e]"
                  />
                  <span className="flex-1 font-semibold text-ink">{m.label}</span>
                  <span className="text-xs text-ink-3">{m.costHint}</span>
                </label>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                onClick={save}
                className="rounded-full bg-sidebar px-6 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-85"
              >
                Speichern
              </button>
              <button
                onClick={async () => {
                  if (!key.trim()) {
                    setTest({ kind: "error", message: "Bitte zuerst einen Key eintragen." });
                    return;
                  }
                  setTest({ kind: "running" });
                  try {
                    await testApiKey(key.trim(), model);
                    setTest({ kind: "ok" });
                  } catch (e) {
                    setTest({
                      kind: "error",
                      message: e instanceof Error ? e.message : "Unbekannter Fehler.",
                    });
                  }
                }}
                disabled={test.kind === "running"}
                className="inline-flex items-center gap-2 rounded-full bg-soft px-5 py-2.5 text-sm font-bold text-ink transition-colors hover:bg-hairline disabled:opacity-50"
              >
                {test.kind === "running" && <Loader2 className="h-4 w-4 animate-spin" />}
                Verbindung testen
              </button>
              {saved && (
                <span className="inline-flex items-center gap-1.5 text-sm font-bold text-pos">
                  <CheckCircle2 className="h-4 w-4" /> Gespeichert
                </span>
              )}
              {test.kind === "ok" && (
                <span className="inline-flex items-center gap-1.5 text-sm font-bold text-pos">
                  <CheckCircle2 className="h-4 w-4" /> Verbindung funktioniert
                </span>
              )}
            </div>
            {test.kind === "error" && (
              <p className="mt-3 flex items-start gap-2 rounded-xl bg-neg-soft p-3 text-xs text-neg">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                {test.message}
              </p>
            )}
          </Card>
        </div>

        <div className="col-span-12 lg:col-span-5">
          <Card className="h-full">
            <CardTitle>So bekommst du einen API-Key</CardTitle>
            <ol className="flex flex-col gap-3 text-sm leading-relaxed text-ink-2">
              <li>
                1. Auf <b>console.anthropic.com</b> ein Konto anlegen und ein
                kleines Guthaben aufladen (5 $ reichen für hunderte
                Foto-Schätzungen).
              </li>
              <li>
                2. Unter <b>API Keys</b> einen neuen Key erstellen und hier
                einfügen.
              </li>
              <li>
                3. Auf der Ernährungs-Seite ein Essensfoto hochladen und{" "}
                <b>„KI schätzen lassen"</b> drücken.
              </li>
            </ol>

            <div className="mt-5 flex items-start gap-3 rounded-2xl bg-soft p-4 text-xs leading-relaxed text-ink-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-pos" />
              <span>
                <b>Datenschutz:</b> Der Key wird nur in diesem Browser
                gespeichert (localStorage) und ausschließlich für direkte
                Anfragen an api.anthropic.com genutzt. Bei einer KI-Schätzung
                wird das jeweilige Foto an Anthropic übertragen — sonst nichts.
                Ohne Key funktioniert die Ernährungs-Seite ganz normal mit
                manueller Eingabe.
              </span>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { FlaskConical, HeartPulse, Loader2, Upload } from "lucide-react";
import { loadDemoData } from "@/modules/demo/generate";

/** Erster Start ohne Daten: erklärt den Weg über den Health-Export
 * und bietet Demo-Daten zum sofortigen Ausprobieren an. */
export default function EmptyState() {
  const [loading, setLoading] = useState(false);

  return (
    <section className="mx-auto mt-10 max-w-xl rounded-3xl bg-card p-10 text-center shadow-sm">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-[linear-gradient(135deg,#f43f7f,#f95f39)] shadow-lg shadow-accent/30">
        <HeartPulse className="h-8 w-8 text-white" />
      </div>

      <h2 className="mt-6 text-2xl font-extrabold text-ink">
        Willkommen bei HealthWeb
      </h2>
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-ink-2">
        Verbinde deine Apple-Health-Daten über den Export aus der Health-App:
        iPhone → Health-App → Profilbild → <b>„Alle Gesundheitsdaten exportieren“</b>{" "}
        — und lade die ZIP-Datei hier hoch. Alles bleibt lokal in deinem Browser,
        nichts wird auf einen Server geladen.
      </p>

      <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link
          href="/import"
          className="inline-flex items-center gap-2 rounded-full bg-sidebar px-6 py-3 text-sm font-bold text-white transition-opacity hover:opacity-85"
        >
          <Upload className="h-4 w-4" />
          Health-Export importieren
        </Link>
        <button
          onClick={async () => {
            setLoading(true);
            try {
              await loadDemoData();
            } finally {
              setLoading(false);
            }
          }}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-full bg-soft px-6 py-3 text-sm font-bold text-ink transition-colors hover:bg-hairline disabled:opacity-60"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FlaskConical className="h-4 w-4" />
          )}
          Mit Demo-Daten ausprobieren
        </button>
      </div>
    </section>
  );
}

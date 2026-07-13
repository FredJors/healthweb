# HealthWeb

Ein Dashboard für deine **Apple-Health-Daten** — komplett im Browser, ohne Server,
ohne Drittanbieter wie Strava.

## Warum ein Datei-Import statt „Login mit Apple Health"?

Apple HealthKit hat **keine Web-API**: Gesundheitsdaten liegen ausschließlich auf dem
iPhone und sind nur für native iOS-Apps zugänglich. Eine Website kann sich daher nicht
direkt verbinden. HealthWeb löst das über den offiziellen Export der Health-App
(Profil → „Alle Gesundheitsdaten exportieren"), der als ZIP hochgeladen und vollständig
**lokal im Browser** geparst wird — auch Exporte mit mehreren hundert MB (Streaming-
Unzip + inkrementeller XML-Scanner, Rohdaten werden nie komplett in den Speicher geladen).

Die Daten landen in **IndexedDB** (lokale Browser-Datenbank). Es gibt keinen Server-Upload.

## Start

```bash
npm install
npm run dev        # Entwicklung: http://localhost:3000
npm run typecheck  # TypeScript prüfen
```

Zum Ausprobieren ohne echten Export: auf dem Dashboard **„Mit Demo-Daten ausprobieren"**.

## Selbst hosten (statischer Export)

Die App ist komplett clientseitig — `npm run build` erzeugt einen fertigen
statischen Ordner `out/`, der mit **jedem** Webserver läuft:

```bash
npm run build
python -m http.server 8000 -d out    # dann http://localhost:8000
```

(`-d out` erspart das cd; alternativ `cd out` und ohne `-d` starten.)

## Netlify-Deployment

Die [netlify.toml](netlify.toml) ist fertig konfiguriert: Repository bei
Netlify verbinden (git init + GitHub-Push vorausgesetzt) — Build-Befehl und
Publish-Ordner (`out/`) werden automatisch erkannt, inklusive
Sicherheits-Headern. Keine Umgebungsvariablen nötig.

## Brauche ich Supabase (eine Datenbank)?

**Für den aktuellen Stand: nein.** Alle Daten liegen in der IndexedDB des
Browsers; die Website ist reines statisches Hosting. Das ist zugleich das
Datenschutz-Versprechen der App — Gesundheitsdaten verlassen das Gerät nicht.

Supabase wird erst sinnvoll, wenn eines davon kommen soll:

| Feature | Was Supabase dann liefert |
|---|---|
| iOS-Kurzbefehl-Webhook (automatischer Sync) | Endpoint (Edge Function) + Tabellen + Auth |
| Zugriff von mehreren Geräten | Auth + synchronisierte Datenhaltung |
| Backup in der Cloud | Storage |

Die Architektur ist darauf vorbereitet: `modules/storage/` ist die einzige
Persistenz-Schicht — ein späterer Supabase-Adapter ersetzt/ergänzt sie, ohne
dass Parser, Analytics oder UI angefasst werden müssen. Wichtig dann: Row Level
Security aktivieren und Gesundheitsdaten möglichst verschlüsselt ablegen.

## Architektur

Modular geschnitten, damit neue Datenquellen und Auswertungs-Features andocken können,
ohne Bestehendes anzufassen:

```
src/
├── app/                        # Next.js-Seiten (Übersicht, Workouts, Import)
├── components/                 # UI: Layout, Karten, Charts (Recharts)
└── modules/
    ├── health-model/           # Domänenmodell (Workout, DailyMetric, SleepNight)
    │                           #   → quellen- und speicherunabhängig
    ├── ingestion/              # Datenquellen — jede liefert ParsedHealthData
    │   └── apple-health-export/#   ZIP-Streaming, XML-Parser, Import-Orchestrierung
    ├── storage/                # Persistenz (Dexie/IndexedDB), Import ersetzt atomar
    ├── analytics/              # Reine Funktionen: Aggregation, Trends, Strecken-Clustering
    ├── insights/               # Trainingslast (TRIMP/ACWR), Erholung, Trainingsvorschläge
    ├── nutrition/              # Mahlzeiten-Tracking + optionale KI-Kalorienschätzung
    └── demo/                   # Deterministische Demo-Daten (180 Tage, inkl. GPS-Routen)
```

## Ernährung & KI-Kalorienschätzung

Auf der Ernährungs-Seite lassen sich pro Tag vier Mahlzeiten (Frühstück,
Mittag, Abend, Sonstiges) mit Foto und Kalorien erfassen — alles lokal in
IndexedDB. Optional schätzt die Anthropic-API die Kalorien vom Foto:

- Eigener API-Key (console.anthropic.com), hinterlegt unter **Einstellungen**
  (Zahnrad) — gespeichert nur im localStorage des Browsers.
- Der Aufruf geht **direkt vom Browser** an api.anthropic.com
  (`dangerouslyAllowBrowser`, CORS) — es gibt weiterhin kein Backend.
- Fotos werden vor Speicherung/Versand auf max. 1024 px komprimiert;
  übertragen wird ein Foto nur beim expliziten Klick auf „KI schätzen lassen".
- Kosten: grob 1–2 Cent pro Foto (Opus 4.8), deutlich darunter mit Haiku 4.5
  (Modell in den Einstellungen wählbar).

Wichtige Entscheidungen:

- **Tagesaggregate statt Rohdaten**: Millionen Herzfrequenz-Samples werden beim Import
  zu Tageswerten (min/⌀/max) verdichtet; pro Workout bleiben ⌀/max Herzfrequenz aus den
  `WorkoutStatistics` erhalten. Das hält die lokale DB klein und die Charts schnell.
- **Quellen-Deduplizierung**: iPhone und Watch zählen Schritte/Kalorien parallel — pro
  Tag gewinnt die Quelle mit dem höchsten Wert (Apples eigene Heuristik im Export fehlt).
- **Import ist idempotent**: Ein Health-Export enthält immer die komplette Historie,
  jeder Import ersetzt daher den gesamten Bestand in einer Transaktion.

## Roadmap

- **Einstellungen-Seite** (Zahnrad in der Sidebar): Zieltempo, Wochenziele,
  Daten exportieren/löschen.
- **Weitere Datenquellen** (`modules/ingestion/`):
  - *iOS-Kurzbefehl → Webhook*: automatischer täglicher Sync ausgewählter Werte
    (benötigt ein kleines Backend, z. B. Supabase — siehe oben).
  - *Begleit-iOS-App*: voller HealthKit-Zugriff mit Hintergrund-Sync
    (benötigt Mac/Xcode + Apple-Developer-Account).

Bereits umgesetzt: Dashboard, Workout-Liste mit Tempo-Trends, Karte mit
automatischer Strecken-Erkennung aus GPS-Routen, 3D-Strecken-Vergleich
(Datum × Herzfrequenz × Tempo) sowie Trainingsvorschläge aus Trainingslast,
Erholung und Wochenmuster.

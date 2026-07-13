import { Unzip, UnzipInflate, type UnzipFile } from "fflate";

/**
 * Streamt die export.xml aus einer Apple-Health-Export-ZIP, ohne die
 * (oft > 500 MB große) XML komplett in den Speicher zu laden, und liefert
 * zusätzlich die GPS-Routen (workout-routes/*.gpx) als komplette Dateien.
 * Nimmt auch eine direkt hochgeladene .xml entgegen (dann ohne Routen).
 *
 * Die Datei wird in 1-MB-Blöcken gelesen; entpackte Chunks landen erst in
 * einer Warteschlange und werden zeitgeschnitten verarbeitet, damit der
 * Main-Thread regelmäßig frei wird (Fortschrittsbalken, keine eingefrorene UI).
 */

export interface ExportStreamCallbacks {
  onXmlChunk: (bytes: Uint8Array) => void;
  /** Komplette GPX-Datei (Name + Inhalt); wird zwischen den XML-Chunks geliefert */
  onGpxFile?: (name: string, bytes: Uint8Array) => void;
  onProgress?: (fractionRead: number) => void;
}

const PUSH_BYTES = 1 << 20; // 1 MB komprimiert pro Block = Progress-Granularität

type QueueItem =
  | { kind: "xml"; bytes: Uint8Array }
  | { kind: "gpx"; name: string; bytes: Uint8Array };

export async function streamHealthExport(
  file: File,
  cb: ExportStreamCallbacks
): Promise<void> {
  const yielder = new Yielder();

  if (file.name.toLowerCase().endsWith(".xml")) {
    for (let offset = 0; offset < file.size; offset += PUSH_BYTES) {
      const end = Math.min(offset + PUSH_BYTES, file.size);
      cb.onXmlChunk(new Uint8Array(await file.slice(offset, end).arrayBuffer()));
      cb.onProgress?.(end / file.size);
      await yielder.maybe();
    }
    return;
  }

  const queue: QueueItem[] = [];
  let entryError: Error | null = null;
  let xmlDone = false;
  let xmlStarted = false;

  const unzip = new Unzip((f) => {
    const name = f.name.toLowerCase();
    // export.zip enthält export.xml, export_cda.xml, EKGs und GPX-Routen —
    // uns interessieren Haupt-XML (nicht die klinische CDA-Variante) und GPX.
    if (!xmlStarted && name.endsWith(".xml") && !name.includes("cda")) {
      xmlStarted = true;
      f.ondata = (err, data, final) => {
        if (err) {
          entryError = err instanceof Error ? err : new Error(String(err));
          return;
        }
        if (data?.length) queue.push({ kind: "xml", bytes: data });
        if (final) xmlDone = true;
      };
      f.start();
    } else if (cb.onGpxFile && name.endsWith(".gpx")) {
      collectEntry(f, (bytes) => queue.push({ kind: "gpx", name: f.name, bytes }),
        (e) => (entryError = e));
    }
    // alles andere (EKG-Ordner, CDA) wird nicht entpackt
  });
  unzip.register(UnzipInflate);

  for (let offset = 0; offset < file.size; offset += PUSH_BYTES) {
    const end = Math.min(offset + PUSH_BYTES, file.size);
    const bytes = new Uint8Array(await file.slice(offset, end).arrayBuffer());
    unzip.push(bytes, end === file.size);
    if (entryError) throw entryError;

    // Warteschlange zeitgeschnitten abarbeiten — hier passiert das Parsen
    while (queue.length) {
      const item = queue.shift()!;
      if (item.kind === "xml") cb.onXmlChunk(item.bytes);
      else cb.onGpxFile?.(item.name, item.bytes);
      await yielder.maybe();
    }

    cb.onProgress?.(end / file.size);
    await yielder.maybe();

    // Ohne GPX-Interesse können wir nach der XML abbrechen (spart I/O)
    if (xmlDone && !cb.onGpxFile) break;
  }

  if (!xmlStarted) {
    throw new Error(
      "In der ZIP-Datei wurde keine export.xml gefunden. Bitte die unveränderte Export-Datei aus der Health-App hochladen."
    );
  }
  if (!xmlDone) {
    throw new Error(
      "Die export.xml in der ZIP-Datei ist unvollständig oder beschädigt. Bitte den Export auf dem iPhone neu erstellen."
    );
  }
}

/** Sammelt einen kompletten (kleinen) ZIP-Eintrag ein, z. B. eine GPX-Datei. */
function collectEntry(
  f: UnzipFile,
  onDone: (bytes: Uint8Array) => void,
  onError: (e: Error) => void
): void {
  const parts: Uint8Array[] = [];
  f.ondata = (err, data, final) => {
    if (err) {
      onError(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    if (data?.length) parts.push(data);
    if (final) {
      let total = 0;
      for (const p of parts) total += p.length;
      const all = new Uint8Array(total);
      let off = 0;
      for (const p of parts) {
        all.set(p, off);
        off += p.length;
      }
      onDone(all);
    }
  };
  f.start();
}

/** Gibt den Event-Loop alle ~40 ms frei, damit die UI flüssig bleibt,
 * ohne den Import durch ständiges Warten auszubremsen. */
class Yielder {
  private last = performance.now();

  async maybe(): Promise<void> {
    if (performance.now() - this.last >= 40) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      this.last = performance.now();
    }
  }
}

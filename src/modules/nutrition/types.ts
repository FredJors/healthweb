/**
 * Ernährungs-Domäne: Mahlzeiten mit Foto und Kalorienschätzung.
 * Bewusst getrennt vom Apple-Health-Modell — diese Daten erzeugt der
 * Nutzer selbst in der App, sie überleben jeden Export-Re-Import.
 */

export type MealSlot = "breakfast" | "lunch" | "dinner" | "other";

export const MEAL_SLOTS: MealSlot[] = ["breakfast", "lunch", "dinner", "other"];

export const MEAL_SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: "Frühstück",
  lunch: "Mittagessen",
  dinner: "Abendessen",
  other: "Sonstiges",
};

export interface Meal {
  /** YYYY-MM-DD */
  day: string;
  slot: MealSlot;
  /** komprimiertes JPEG, lokal in IndexedDB */
  photo?: Blob;
  kcal?: number;
  /** Gericht, z. B. "Spaghetti Bolognese" */
  label?: string;
  /** Zusatzinfo, z. B. Spanne der KI-Schätzung */
  note?: string;
  source?: "ki" | "manuell";
  updatedAt: string;
}

/** Ergebnis der KI-Schätzung (strukturierte JSON-Antwort der API). */
export interface MealEstimate {
  dish: string;
  kcal: number;
  kcal_min: number;
  kcal_max: number;
  confidence: "niedrig" | "mittel" | "hoch";
  note: string;
}

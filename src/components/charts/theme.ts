/** Chart-Farben — validiert mit dem dataviz-Palette-Validator (Licht-Modus,
 * Fläche #ffffff): Kategorien ΔE(CVD) ≥ 37, Kontrast ≥ 3:1; Schlaf-Rampe
 * als ordinale Ein-Farb-Rampe geprüft. */
export const chartColors = {
  accent: "#e0446e",
  orange: "#eb6834",
  blue: "#2a78d6",
  /** De-Emphasis für Kontext-Balken */
  muted: "#e6e1d5",
  grid: "#eee9df",
  axis: "#9b968b",
  cursor: "rgba(26,26,26,0.045)",
  sleep: {
    deep: "#0d366b",
    core: "#2a78d6",
    rem: "#86b6ef",
    awake: "#eb6834",
  },
} as const;

"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { WorkoutType } from "@/modules/health-model/types";
import { boundsOf, type RouteGroup } from "@/modules/analytics/routes";

/** Kartenfarben je Sportart (identisch zur Chart-Palette). */
const TYPE_COLOR: Partial<Record<WorkoutType, string>> = {
  running: "#e0446e",
  cycling: "#eb6834",
  walking: "#2a78d6",
  hiking: "#2a78d6",
  swimming: "#2a78d6",
  rowing: "#2a78d6",
};
const FALLBACK_COLOR = "#6e6a61";

/**
 * OpenStreetMap-Karte mit allen Strecken. Häufig genutzte Strecken wirken
 * durch die Überlagerung ihrer Einzel-Routen automatisch kräftiger.
 * Klick auf eine Route wählt ihre Strecken-Gruppe aus.
 */
export default function RouteMap({
  groups,
  selectedId,
  onSelect,
}: {
  groups: RouteGroup[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const didInitialFit = useRef(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende',
    }).addTo(map);
    map.setView([51.16, 10.45], 6); // Deutschland, bis Routen geladen sind
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();
    for (const group of groups) {
      const color = TYPE_COLOR[group.type] ?? FALLBACK_COLOR;
      const isSelected = group.id === selectedId;
      for (const route of group.routes) {
        const line = L.polyline(route.points, {
          color,
          weight: isSelected ? 4 : 2.5,
          opacity: selectedId === null ? 0.35 : isSelected ? 0.9 : 0.1,
        });
        line.on("click", () => onSelect(group.id));
        layer.addLayer(line);
      }
    }

    const selected = groups.find((g) => g.id === selectedId);
    if (selected) {
      const b = boundsOf(selected.routes);
      if (b) map.flyToBounds(b, { padding: [36, 36], duration: 0.5 });
    } else {
      const b = boundsOf(groups.flatMap((g) => g.routes));
      if (b) {
        if (didInitialFit.current) {
          map.flyToBounds(b, { padding: [36, 36], duration: 0.5 });
        } else {
          map.fitBounds(b, { padding: [36, 36] });
          didInitialFit.current = true;
        }
      }
    }
  }, [groups, selectedId, onSelect]);

  return <div ref={containerRef} className="h-full w-full" />;
}

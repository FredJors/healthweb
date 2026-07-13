"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Apple,
  HeartPulse,
  LayoutGrid,
  Dumbbell,
  Map,
  Settings,
  Sparkles,
  Upload,
  ShieldCheck,
} from "lucide-react";

const NAV = [
  { href: "/", label: "Übersicht", icon: LayoutGrid },
  { href: "/training", label: "Training", icon: Sparkles },
  { href: "/workouts", label: "Workouts", icon: Dumbbell },
  { href: "/karte", label: "Karte", icon: Map },
  { href: "/ernaehrung", label: "Ernährung", icon: Apple },
  { href: "/import", label: "Daten importieren", icon: Upload },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 flex h-screen w-[76px] shrink-0 flex-col items-center bg-sidebar py-6">
      <Link
        href="/"
        title="HealthWeb"
        className="mb-10 flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#f43f7f,#f95f39)] shadow-lg shadow-black/30"
      >
        <HeartPulse className="h-6 w-6 text-white" strokeWidth={2.2} />
      </Link>

      <nav className="flex flex-col gap-2">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              title={label}
              aria-label={label}
              className={`relative flex h-11 w-11 items-center justify-center rounded-2xl transition-colors ${
                active
                  ? "bg-page text-ink"
                  : "text-white/45 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Icon className="h-5 w-5" strokeWidth={2} />
              {active && (
                <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-accent" />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col items-center gap-3">
        <span title="Deine Daten bleiben lokal in deinem Browser">
          <ShieldCheck className="h-5 w-5 text-white/35" />
        </span>
        <Link
          href="/einstellungen"
          title="Einstellungen"
          aria-label="Einstellungen"
          className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
            pathname.startsWith("/einstellungen")
              ? "bg-page text-ink"
              : "bg-white/10 text-white/80 hover:bg-white/20 hover:text-white"
          }`}
        >
          <Settings className="h-5 w-5" strokeWidth={2} />
        </Link>
      </div>
    </aside>
  );
}

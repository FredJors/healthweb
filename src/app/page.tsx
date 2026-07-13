"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronRight, Footprints, HeartPulse, Activity, Loader2 } from "lucide-react";
import { loadDashboardData } from "@/modules/analytics/dashboard";
import PageHeader from "@/components/layout/PageHeader";
import Card, { CardTitle } from "@/components/ui/Card";
import HeroCard from "@/components/dashboard/HeroCard";
import StatTile from "@/components/dashboard/StatTile";
import EmptyState from "@/components/dashboard/EmptyState";
import WorkoutRow from "@/components/dashboard/WorkoutRow";
import SleepDonut from "@/components/charts/SleepDonut";
import ActivityBars from "@/components/charts/ActivityBars";
import TrendLine from "@/components/charts/TrendLine";
import { chartColors } from "@/components/charts/theme";
import {
  fmtDateShort,
  fmtHoursColon,
  fmtInt,
} from "@/modules/analytics/format";

export default function DashboardPage() {
  const data = useLiveQuery(loadDashboardData, []);

  return (
    <>
      <PageHeader title="Übersicht" />

      {data === undefined ? (
        <div className="flex justify-center py-24 text-ink-3">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : data === null ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-12 gap-5">
          {/* Reihe 1 */}
          <div className="col-span-12 xl:col-span-5">
            <HeroCard data={data} />
          </div>

          <div className="col-span-12 md:col-span-7 xl:col-span-4">
            <Card className="h-full">
              <CardTitle
                sub={
                  data.sleep.lastNight
                    ? `Nacht auf ${fmtDateShort(data.sleep.lastNight.day)}` +
                      (data.sleep.avg14Min
                        ? ` · Ø 14 Tage: ${fmtHoursColon(data.sleep.avg14Min)} h`
                        : "")
                    : undefined
                }
              >
                Schlaf
              </CardTitle>
              {data.sleep.lastNight ? (
                <SleepDonut night={data.sleep.lastNight} />
              ) : (
                <p className="py-10 text-center text-sm text-ink-3">
                  Keine Schlafdaten gefunden.
                </p>
              )}
            </Card>
          </div>

          <div className="col-span-12 flex flex-col gap-5 md:col-span-5 xl:col-span-3">
            <StatTile
              icon={HeartPulse}
              label="Ruhepuls"
              value={data.restingHR.current !== null ? fmtInt(data.restingHR.current) : "–"}
              unit="bpm"
              delta={data.restingHR.deltaVs30}
              deltaSuffix=" bpm"
              upIsGood={false}
              spark={data.restingHR.spark}
            />
            <StatTile
              icon={Activity}
              iconClass="bg-blue-soft text-blue"
              label="Herzfrequenz-Variabilität"
              value={data.hrv.current !== null ? fmtInt(data.hrv.current) : "–"}
              unit="ms"
              delta={data.hrv.deltaVs30}
              deltaSuffix=" ms"
              upIsGood={true}
              spark={data.hrv.spark}
            />
          </div>

          {/* Reihe 2 */}
          <div className="col-span-12 xl:col-span-7">
            <Card className="h-full">
              <div className="mb-2 flex items-center">
                <CardTitle sub="Tempo-Trend im Vergleich zu deinen letzten Einheiten">
                  Letzte Workouts
                </CardTitle>
                <Link
                  href="/workouts"
                  className="mb-4 ml-auto inline-flex items-center gap-0.5 text-xs font-bold text-accent hover:underline"
                >
                  Alle ansehen <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              {data.recentWorkouts.length ? (
                <ul className="-mx-3 flex flex-col">
                  {data.recentWorkouts.map((w, i) => (
                    <WorkoutRow key={w.id ?? `${w.startDate}-${i}`} workout={w} />
                  ))}
                </ul>
              ) : (
                <p className="py-10 text-center text-sm text-ink-3">
                  Keine Workouts gefunden.
                </p>
              )}
            </Card>
          </div>

          <div className="col-span-12 flex flex-col gap-5 xl:col-span-5">
            <Card>
              <CardTitle sub="Letzte 14 Tage · bester Tag hervorgehoben">
                Schritte
              </CardTitle>
              <ActivityBars
                data={data.steps.series14}
                highlightDay={data.steps.bestDay}
              />
            </Card>

            <Card>
              <div className="flex items-center gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                  <Footprints className="h-5 w-5" strokeWidth={2.2} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-ink-3">
                    Schritte heute
                    {data.steps.avg30 !== null &&
                      ` · Ø 30 Tage: ${fmtInt(data.steps.avg30)}`}
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-accent-soft">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{
                        width: `${Math.min(
                          100,
                          data.steps.avg30
                            ? ((data.steps.today ?? 0) / (data.steps.avg30 * 1.25)) * 100
                            : 0
                        )}%`,
                      }}
                    />
                  </div>
                </div>
                <div className="text-2xl font-extrabold text-ink">
                  {data.steps.today !== null ? fmtInt(data.steps.today) : "–"}
                </div>
              </div>
            </Card>
          </div>

          {/* Reihe 3 */}
          <div className="col-span-12">
            <Card>
              <CardTitle sub="Letzte 90 Tage — ein sinkender Ruhepuls deutet auf steigende Fitness hin">
                Ruhepuls im Verlauf
              </CardTitle>
              <TrendLine
                data={data.restingHR.series90}
                unit="bpm Ruhepuls"
                color={chartColors.accent}
              />
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

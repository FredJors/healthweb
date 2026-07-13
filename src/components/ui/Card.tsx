export default function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-3xl bg-card p-6 shadow-[0_1px_2px_rgba(20,18,12,0.04),0_8px_24px_-12px_rgba(20,18,12,0.08)] ${className}`}
    >
      {children}
    </section>
  );
}

export function CardTitle({
  children,
  sub,
}: {
  children: React.ReactNode;
  sub?: string;
}) {
  return (
    <div className="mb-4">
      <h2 className="text-[15px] font-bold text-ink">{children}</h2>
      {sub && <p className="mt-0.5 text-xs text-ink-3">{sub}</p>}
    </div>
  );
}

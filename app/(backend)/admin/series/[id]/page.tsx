import { and, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SeriesForm } from "@/components/admin/series-form";
import { requireStaff } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { series } from "@/lib/db/schema";

export default async function EditSeriesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }] = await Promise.all([params, requireStaff()]);
  const [item] = await db
    .select()
    .from(series)
    .where(and(eq(series.id, id), isNull(series.deletedAt)))
    .limit(1);
  if (!item) notFound();

  return (
    <section className="mx-auto max-w-3xl">
      <p className="text-sm text-muted-foreground">
        <Link href="/admin/series" className="hover:text-foreground">系列</Link>
        <span className="mx-2" aria-hidden>/</span>
        编辑
      </p>
      <h1 className="headline mt-4 text-3xl">{item.name}</h1>
      <div className="mt-8 rounded-lg border bg-card p-6">
        <SeriesForm series={item} />
      </div>
    </section>
  );
}

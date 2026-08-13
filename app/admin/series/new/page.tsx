import Link from "next/link";
import { SeriesForm } from "@/components/admin/series-form";
import { requireStaff } from "@/lib/auth/permissions";

export default async function NewSeriesPage() {
  await requireStaff();
  return (
    <section className="mx-auto max-w-3xl">
      <p className="text-sm text-muted-foreground">
        <Link href="/admin/series" className="hover:text-foreground">系列</Link>
        <span className="mx-2" aria-hidden>/</span>
        新建
      </p>
      <h1 className="headline mt-4 text-3xl">新建系列</h1>
      <div className="mt-8 rounded-lg border bg-card p-6">
        <SeriesForm />
      </div>
    </section>
  );
}

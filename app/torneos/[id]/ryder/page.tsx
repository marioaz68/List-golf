import { createClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import { loadRyderPublic } from "@/lib/ryder/loadRyderPublic";
import RyderCups from "./RyderCups";

export const revalidate = 30;

export default async function RyderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );

  const data = await loadRyderPublic(db, id);
  if (!data) notFound();

  return <RyderCups data={data} />;
}

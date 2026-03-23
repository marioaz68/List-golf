import { createClient } from "@/utils/supabase/server";
import ClubsClient from "./ClubsClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ClubBaseRow = {
  id: string;
  name: string | null;
  short_name: string | null;
  normalized_name: string | null;
  is_active: boolean | null;
  created_at: string | null;
};

type CourseRefRow = {
  id: string;
  club_id: string | null;
};

type ClubRow = {
  id: string;
  name: string | null;
  short_name: string | null;
  normalized_name: string | null;
  is_active: boolean | null;
  created_at: string | null;
  courses_count: number;
};

function scoreClub(row: ClubRow) {
  let score = 0;
  if (row.is_active) score += 100000;
  score += row.courses_count * 100;
  if (row.short_name?.trim()) score += 10;
  if (row.name?.trim()) score += 1;
  return score;
}

export default async function ClubsPage() {
  const supabase = await createClient();

  const [clubsRes, coursesRes] = await Promise.all([
    supabase
      .from("clubs")
      .select("id, name, short_name, normalized_name, is_active, created_at"),
    supabase.from("courses").select("id, club_id"),
  ]);

  if (clubsRes.error) {
    throw new Error(`Error leyendo clubs: ${clubsRes.error.message}`);
  }

  if (coursesRes.error) {
    throw new Error(`Error leyendo courses: ${coursesRes.error.message}`);
  }

  const rawClubs = (clubsRes.data ?? []) as ClubBaseRow[];
  const courses = (coursesRes.data ?? []) as CourseRefRow[];

  const coursesByClubId = new Map<string, number>();

  for (const row of courses) {
    if (!row.club_id) continue;
    coursesByClubId.set(
      row.club_id,
      (coursesByClubId.get(row.club_id) ?? 0) + 1
    );
  }

  const allClubs: ClubRow[] = rawClubs.map((club) => ({
    ...club,
    courses_count: coursesByClubId.get(club.id) ?? 0,
  }));

  const ordered = [...allClubs].sort((a, b) => {
    const byScore = scoreClub(b) - scoreClub(a);
    if (byScore !== 0) return byScore;

    return String(a.name ?? "").localeCompare(String(b.name ?? ""), "es", {
      sensitivity: "base",
    });
  });

  return <ClubsClient clubs={ordered} />;
}
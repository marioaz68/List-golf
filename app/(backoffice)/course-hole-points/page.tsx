import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { loadCourseReferencePoints } from "@/lib/distances/loadCourseReferencePoints";
import { loadGreenOverridesForCourse } from "@/lib/distances/loadGreenPoints";
import CourseHolePointsClient from "./CourseHolePointsClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SP = { [key: string]: string | string[] | undefined };

export default async function CourseHolePointsPage(props: {
  searchParams?: SP | Promise<SP>;
}) {
  const supabase = await createClient();
  const sp = props.searchParams ? await props.searchParams : {};
  const courseId =
    typeof sp.course_id === "string" ? sp.course_id.trim() : "";

  const { data: cData, error: cErr } = await supabase
    .from("courses")
    .select("id, name, club_name")
    .order("name", { ascending: true });

  if (cErr) {
    return (
      <div className="p-3 text-red-200">Error: {cErr.message}</div>
    );
  }

  const courses = (cData ?? []) as Array<{
    id: string;
    name: string | null;
    club_name: string | null;
  }>;
  const effectiveCourseId = courseId || courses[0]?.id || "";

  if (!courseId && effectiveCourseId) {
    redirect(`/course-hole-points?course_id=${effectiveCourseId}`);
  }

  let initialPoints: Awaited<ReturnType<typeof loadCourseReferencePoints>> = [];
  let initialGreenOverrides: Awaited<
    ReturnType<typeof loadGreenOverridesForCourse>
  > = [];
  if (effectiveCourseId) {
    try {
      initialPoints = await loadCourseReferencePoints(effectiveCourseId);
    } catch {
      initialPoints = [];
    }
    try {
      initialGreenOverrides =
        await loadGreenOverridesForCourse(effectiveCourseId);
    } catch {
      initialGreenOverrides = [];
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-3 p-3 md:p-4">
      <div>
        <h1 className="text-base font-semibold text-white">
          Puntos del campo (yardas)
        </h1>
        <p className="mt-1 text-xs text-slate-400">
          Calibra los <strong className="text-emerald-300">puntos verdes</strong>{" "}
          (entrada, centro, atrás del green) arrastrándolos en el mapa, o marca
          bunkers, agua y otros puntos. Todo aparece en la mini app 📏 Yardas.
        </p>
      </div>
      <CourseHolePointsClient
        courses={courses}
        courseId={effectiveCourseId}
        initialPoints={initialPoints}
        initialGreenOverrides={initialGreenOverrides}
      />
    </div>
  );
}

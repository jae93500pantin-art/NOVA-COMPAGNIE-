import { DriverCourses } from "@/components/DriverCourses";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Mes courses — Nova Compagnie" };

export default async function CoursesPage() {
  await requireUser("/compte/courses");

  return (
    <div className="mx-auto max-w-3xl px-5 pb-16 pt-28 lg:px-8 lg:pt-32">
      <DriverCourses />
    </div>
  );
}

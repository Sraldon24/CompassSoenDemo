import { getSession } from "@/lib/auth/get-session";
import { getAllCourses, getUserPlanSnapshot } from "@/lib/data/queries/plan";
import { redirect } from "next/navigation";
import { PrereqMapClient } from "./client";

export const metadata = {
  title: "Prereq Map",
};

export default async function MapPage(): Promise<React.ReactElement> {
  const session = await getSession();
  if (!session) redirect("/login");

  const [catalog, snapshot] = await Promise.all([
    getAllCourses(),
    getUserPlanSnapshot(session.user.id),
  ]);

  const takenCodes: string[] = [];
  const plannedCodes: string[] = [];
  for (const p of snapshot.userPlan) {
    if (p.status === "transferred" || p.status === "completed") {
      takenCodes.push(p.courseCode);
    } else if (p.status === "enrolled" || p.status === "planned") {
      plannedCodes.push(p.courseCode);
    }
  }

  return <PrereqMapClient catalog={catalog} takenCodes={takenCodes} plannedCodes={plannedCodes} />;
}

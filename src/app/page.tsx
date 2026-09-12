import { TimeMachine } from "@/components/time/time-machine";
import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default function HomePage() {
  try {
    db.run(sql`select 1`);
  } catch (error) {
    console.warn("Local database check:", error);
  }
  return <TimeMachine />;
}


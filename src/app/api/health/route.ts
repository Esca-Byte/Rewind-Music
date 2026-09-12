import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    db.run(sql`select 1`);
    return Response.json({ ok: true, mode: "local-sqlite" });
  } catch (error) {
    console.error("Health check error:", error);
    return Response.json({ ok: false, mode: "local-sqlite" }, { status: 500 });
  }
}


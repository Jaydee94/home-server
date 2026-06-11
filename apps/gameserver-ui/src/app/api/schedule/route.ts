import { NextResponse } from "next/server";
import { VmClient } from "@/lib/k8s";

export async function GET() {
  try {
    const client = VmClient.inCluster();
    const cronJobs = await client.getCronJobs();
    return NextResponse.json({ cronJobs });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { name, schedule, suspended } = (await req.json()) as {
      name?: string;
      schedule?: string;
      suspended?: boolean;
    };
    if (!name) return NextResponse.json({ error: "name fehlt" }, { status: 400 });

    const client = VmClient.inCluster();
    if (schedule !== undefined) {
      const { parseCronSchedule } = await import("@/lib/schedule");
      if (!parseCronSchedule(schedule)) {
        return NextResponse.json(
          { error: "Nur einfache Schedules (M H * * *) erlaubt" },
          { status: 400 }
        );
      }
      await client.updateCronJobSchedule(name, schedule);
    }
    if (suspended !== undefined) {
      await client.suspendCronJob(name, suspended);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}

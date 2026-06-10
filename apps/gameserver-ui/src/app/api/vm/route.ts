import { NextResponse } from "next/server";
import { VmClient } from "@/lib/k8s";

export async function GET() {
  try {
    return NextResponse.json(await VmClient.inCluster().getStatus());
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}

export async function POST(req: Request) {
  const { action } = await req.json().catch(() => ({}));
  if (action !== "start" && action !== "stop") {
    return NextResponse.json({ error: "action muss start|stop sein" }, { status: 400 });
  }
  try {
    await VmClient.inCluster().setRunStrategy(action === "start" ? "Always" : "Halted");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}

import { NextResponse } from "next/server";

const VICTORIA_URL = process.env.VICTORIA_URL
  ?? "http://vmsingle-monitoring.monitoring.svc.cluster.local:8428";

export async function GET() {
  try {
    const ns = process.env.GAMESERVER_NAMESPACE ?? "gameserver";
    const vm = process.env.VM_NAME ?? "7dtd-server";

    const [cpuRes, memRes] = await Promise.all([
      fetch(`${VICTORIA_URL}/api/v1/query?query=rate(container_cpu_usage_seconds_total%7Bnamespace%3D%22${ns}%22%2Cpod%3D~%22virt-launcher-${vm}.*%22%7D%5B5m%5D)*100`),
      fetch(`${VICTORIA_URL}/api/v1/query?query=container_memory_working_set_bytes%7Bnamespace%3D%22${ns}%22%2Cpod%3D~%22virt-launcher-${vm}.*%22%7D`),
    ]);

    const cpu = cpuRes.ok ? (await cpuRes.json()).data?.result?.[0]?.value?.[1] ?? null : null;
    const mem = memRes.ok ? (await memRes.json()).data?.result?.[0]?.value?.[1] ?? null : null;

    return NextResponse.json({
      cpuPercent: cpu !== null ? Math.round(parseFloat(cpu) * 10) / 10 : null,
      memoryMb: mem !== null ? Math.round(parseInt(mem) / 1024 / 1024) : null,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}

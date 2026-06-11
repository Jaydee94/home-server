import { NextResponse } from "next/server";

const VICTORIA_URL = process.env.VICTORIA_URL
  ?? "http://vmsingle-monitoring-victoria-metrics-k8s-stack.monitoring.svc.cluster.local:8428";

export async function GET() {
  try {
    const vm = process.env.VM_NAME ?? "7dtd-server";

    const [cpuRes, memRes, memTotalRes] = await Promise.all([
      fetch(`${VICTORIA_URL}/api/v1/query?query=rate(kubevirt_vmi_vcpu_seconds_total%7Bname%3D%22${vm}%22%7D%5B5m%5D)*100`),
      fetch(`${VICTORIA_URL}/api/v1/query?query=kubevirt_vmi_memory_resident_bytes%7Bname%3D%22${vm}%22%7D`),
      fetch(`${VICTORIA_URL}/api/v1/query?query=kubevirt_vm_resource_requests%7Bname%3D%22${vm}%22%2Cresource%3D%22memory%22%2Csource%3D%22guest%22%7D`),
    ]);

    const cpu = cpuRes.ok ? (await cpuRes.json()).data?.result?.[0]?.value?.[1] ?? null : null;
    const mem = memRes.ok ? (await memRes.json()).data?.result?.[0]?.value?.[1] ?? null : null;
    const memTotal = memTotalRes.ok ? (await memTotalRes.json()).data?.result?.[0]?.value?.[1] ?? null : null;

    return NextResponse.json({
      cpuPercent: cpu !== null ? Math.round(parseFloat(cpu) * 10) / 10 : null,
      memoryMb: mem !== null ? Math.round(parseInt(mem) / 1024 / 1024) : null,
      memoryTotalMb: memTotal !== null ? Math.round(parseInt(memTotal) / 1024 / 1024) : null,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}

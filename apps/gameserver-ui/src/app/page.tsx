"use client";
import { useCallback, useEffect, useState } from "react";

interface VmStatus {
  runStrategy: string;
  printableStatus: string;
  vmiPhase: string | null;
  ipAddress: string | null;
  runningSince: string | null;
}

export default function Dashboard() {
  const [status, setStatus] = useState<VmStatus | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/vm");
    if (res.ok) {
      setStatus(await res.json());
      setError("");
    } else {
      setError(`Status nicht abrufbar (${res.status})`);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh]);

  async function act(action: "start" | "stop") {
    if (
      action === "stop" &&
      !confirm("VM wirklich stoppen? Der 7DTD-Server wird heruntergefahren.")
    ) {
      return;
    }
    setBusy(true);
    await fetch("/api/vm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    await refresh();
    setBusy(false);
  }

  const running = status?.vmiPhase === "Running";

  return (
    <main style={{ maxWidth: 640, margin: "5vh auto", fontFamily: "sans-serif" }}>
      <h1>7DTD Gameserver</h1>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      {!status ? (
        <p>Lade…</p>
      ) : (
        <>
          <table cellPadding={6}>
            <tbody>
              <tr>
                <td>Status</td>
                <td>
                  <strong>{status.printableStatus}</strong> (VMI: {status.vmiPhase ?? "—"})
                </td>
              </tr>
              <tr>
                <td>runStrategy</td>
                <td>{status.runStrategy}</td>
              </tr>
              <tr>
                <td>IP</td>
                <td>{status.ipAddress ?? "—"}</td>
              </tr>
              <tr>
                <td>Läuft seit</td>
                <td>
                  {status.runningSince
                    ? new Date(status.runningSince).toLocaleString("de-DE")
                    : "—"}
                </td>
              </tr>
            </tbody>
          </table>
          <p>
            <button disabled={busy || running} onClick={() => act("start")}>
              ▶ Starten
            </button>{" "}
            <button disabled={busy || !running} onClick={() => act("stop")}>
              ■ Stoppen
            </button>
          </p>
        </>
      )}
    </main>
  );
}

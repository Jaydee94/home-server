"use client";
import { useEffect, useState } from "react";
import { parseCronSchedule, toSimpleCron } from "@/lib/schedule";

interface CronJobInfo {
  name: string;
  schedule: string;
  suspended: boolean;
  lastScheduleTime?: string;
}

export default function SchedulePage() {
  const [jobs, setJobs] = useState<CronJobInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch("/api/schedule");
    if (res.ok) {
      setJobs((await res.json()).cronJobs);
      setError("");
    } else {
      setError("Fehler beim Laden der Schedules");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function patch(name: string, body: object) {
    setBusy(true);
    setMsg("");
    setError("");
    const res = await fetch("/api/schedule", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, ...body }),
    });
    setBusy(false);
    if (res.ok) {
      setMsg("✓ Gespeichert");
      load();
    } else {
      setError("Fehler: " + ((await res.json()).error ?? "unbekannt"));
    }
  }

  return (
    <main style={{ maxWidth: 700, margin: "5vh auto", fontFamily: "sans-serif" }}>
      <h1>CronJob-Zeitplanung</h1>
      {msg && <p style={{ color: "green" }}>{msg}</p>}
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      <table cellPadding={6} style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
            <th>Job</th>
            <th>Uhrzeit</th>
            <th>Aktiviert</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => {
            const simple = parseCronSchedule(job.schedule);
            return (
              <tr key={job.name} style={{ borderBottom: "1px solid #eee" }}>
                <td>{job.name}</td>
                <td>
                  {simple ? (
                    <input
                      type="time"
                      defaultValue={`${String(simple.hour).padStart(2, "0")}:${String(simple.minute).padStart(2, "0")}`}
                      disabled={busy || job.suspended}
                      onBlur={(e) => {
                        const [h, m] = e.target.value.split(":").map(Number);
                        patch(job.name, { schedule: toSimpleCron(h, m) });
                      }}
                    />
                  ) : (
                    <code style={{ fontSize: "0.85em" }}>{job.schedule}</code>
                  )}
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={!job.suspended}
                    disabled={busy}
                    onChange={(e) =>
                      patch(job.name, { suspended: !e.target.checked })
                    }
                  />
                </td>
                <td style={{ color: "#888", fontSize: "0.8em" }}>
                  {job.lastScheduleTime
                    ? new Date(job.lastScheduleTime).toLocaleString("de-DE")
                    : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p>
        <a href="/">← Dashboard</a>
      </p>
    </main>
  );
}

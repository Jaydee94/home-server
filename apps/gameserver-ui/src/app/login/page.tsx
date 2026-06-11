"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const res = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    if (res.ok) router.push("/"); else setError("Falsches Passwort");
  }

  return (
    <main style={{ maxWidth: 340, margin: "18vh auto", padding: "var(--sp-4)" }}>
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)", fontWeight: 700, fontSize: 18, marginBottom: "var(--sp-4)" }}>🧟 7DTD Gameserver</div>
        <form onSubmit={submit} style={{ display: "grid", gap: "var(--sp-3)" }}>
          <input type="password" value={password} placeholder="Passwort" autoFocus onChange={(e) => setPassword(e.target.value)}
            style={{ padding: "var(--sp-3)", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--fg)" }} />
          <Button variant="primary" type="submit">Anmelden</Button>
        </form>
        {error && <p style={{ color: "var(--danger)", marginTop: "var(--sp-3)", fontSize: 13 }}>{error}</p>}
      </Card>
    </main>
  );
}

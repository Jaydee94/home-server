"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) router.push("/");
    else setError("Falsches Passwort");
  }

  return (
    <main style={{ maxWidth: 320, margin: "20vh auto", fontFamily: "sans-serif" }}>
      <h1>7DTD Gameserver</h1>
      <form onSubmit={submit}>
        <input
          type="password"
          value={password}
          placeholder="Passwort"
          onChange={(e) => setPassword(e.target.value)}
          style={{ width: "100%", padding: 8 }}
          autoFocus
        />
        <button type="submit" style={{ width: "100%", padding: 8, marginTop: 8 }}>
          Anmelden
        </button>
      </form>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
    </main>
  );
}

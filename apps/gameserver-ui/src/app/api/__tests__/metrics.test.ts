import { describe, it, expect, vi, beforeEach } from "vitest";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import { GET } from "@/app/api/metrics/route";

beforeEach(() => fetchMock.mockReset());

function makeMetricResponse(value: string | null) {
  return {
    ok: value !== null,
    json: async () => ({
      data: { result: value !== null ? [{ value: [0, value] }] : [] },
    }),
  };
}

describe("/api/metrics", () => {
  it("liefert CPU und RAM wenn VictoriaMetrics antwortet", async () => {
    fetchMock
      .mockResolvedValueOnce(makeMetricResponse("25.5"))
      .mockResolvedValueOnce(makeMetricResponse(String(512 * 1024 * 1024)));

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cpuPercent).toBe(25.5);
    expect(body.memoryMb).toBe(512);
  });

  it("liefert null-Werte wenn Metriken leer sind", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { result: [] } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { result: [] } }) });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cpuPercent).toBeNull();
    expect(body.memoryMb).toBeNull();
  });

  it("liefert null wenn VictoriaMetrics nicht erreichbar (HTTP-Fehler)", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cpuPercent).toBeNull();
    expect(body.memoryMb).toBeNull();
  });

  it("liefert 502 wenn fetch wirft", async () => {
    const err = new Error("Network error");
    fetchMock.mockRejectedValueOnce(err).mockRejectedValueOnce(err);

    const res = await GET();
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toContain("Network error");
  });

  it("rundet CPU auf eine Nachkommastelle", async () => {
    fetchMock
      .mockResolvedValueOnce(makeMetricResponse("12.3456789"))
      .mockResolvedValueOnce(makeMetricResponse(String(256 * 1024 * 1024)));

    const res = await GET();
    const body = await res.json();
    expect(body.cpuPercent).toBe(12.3);
  });
});

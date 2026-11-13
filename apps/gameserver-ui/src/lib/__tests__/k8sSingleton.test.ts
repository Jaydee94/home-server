import { describe, it, expect, vi } from "vitest";

const h = vi.hoisted(() => ({ kubeConfigs: 0, apiClients: 0 }));

vi.mock("@kubernetes/client-node", () => {
  class KubeConfig {
    constructor() { h.kubeConfigs++; }
    loadFromDefault() {}
    makeApiClient() { h.apiClients++; return {}; }
  }
  return { KubeConfig, CustomObjectsApi: class {}, BatchV1Api: class {} };
});

import { VmClient } from "@/lib/k8s";

describe("VmClient.inCluster", () => {
  it("baut KubeConfig und API-Client nur einmal pro Prozess", () => {
    const a = VmClient.inCluster();
    const clientsAfterFirst = h.apiClients;
    const b = VmClient.inCluster();
    const c = VmClient.inCluster();

    expect(b).toBe(a);
    expect(c).toBe(a);
    expect(h.kubeConfigs).toBe(1);
    expect(h.apiClients).toBe(clientsAfterFirst);
  });
});

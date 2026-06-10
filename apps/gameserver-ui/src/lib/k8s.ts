import * as k8s from "@kubernetes/client-node";

const NAMESPACE = process.env.GAMESERVER_NAMESPACE ?? "gameserver";
const VM_NAME = process.env.VM_NAME ?? "7dtd-server";
const GVK = { group: "kubevirt.io", version: "v1" };

export interface VmStatus {
  runStrategy: string;
  printableStatus: string;
  vmiPhase: string | null;
  ipAddress: string | null;
  runningSince: string | null;
}

type KubeVirtVm = {
  spec?: { runStrategy?: string };
  status?: { printableStatus?: string };
};

type KubeVirtVmi = {
  status?: {
    phase?: string;
    interfaces?: { ipAddress?: string }[];
    phaseTransitionTimestamps?: { phase: string; phaseTransitionTimestamp: string }[];
  };
};

export class VmClient {
  constructor(private api: k8s.CustomObjectsApi) {}

  static inCluster(): VmClient {
    const kc = new k8s.KubeConfig();
    kc.loadFromDefault();
    return new VmClient(kc.makeApiClient(k8s.CustomObjectsApi));
  }

  async getStatus(): Promise<VmStatus> {
    const vm = (await this.api.getNamespacedCustomObject({
      ...GVK,
      namespace: NAMESPACE,
      plural: "virtualmachines",
      name: VM_NAME,
    })) as KubeVirtVm;

    let vmi: KubeVirtVmi | null = null;
    try {
      vmi = (await this.api.getNamespacedCustomObject({
        ...GVK,
        namespace: NAMESPACE,
        plural: "virtualmachineinstances",
        name: VM_NAME,
      })) as KubeVirtVmi;
    } catch (err) {
      if ((err as { code?: number }).code !== 404) throw err;
    }

    const running = vmi?.status?.phaseTransitionTimestamps?.find(
      (t) => t.phase === "Running"
    );

    return {
      runStrategy: vm.spec?.runStrategy ?? "Unknown",
      printableStatus: vm.status?.printableStatus ?? "Unknown",
      vmiPhase: vmi?.status?.phase ?? null,
      ipAddress: vmi?.status?.interfaces?.[0]?.ipAddress ?? null,
      runningSince: running?.phaseTransitionTimestamp ?? null,
    };
  }

  async setRunStrategy(strategy: "Always" | "Halted"): Promise<void> {
    await this.api.patchNamespacedCustomObject(
      {
        ...GVK,
        namespace: NAMESPACE,
        plural: "virtualmachines",
        name: VM_NAME,
        body: { spec: { runStrategy: strategy } },
      },
      k8s.setHeaderOptions("Content-Type", k8s.PatchStrategy.MergePatch)
    );
  }
}

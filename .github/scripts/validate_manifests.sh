#!/usr/bin/env bash
# Render every app under argocd/apps the way ArgoCD does and validate the
# result against Kubernetes + CRD schemas with kubeconform.
#
#   Helm chart (Chart.yaml)       helm dependency build + helm template
#   Kustomize (kustomization.yaml) kubectl kustomize
#   anything else                  the YAML files are validated as they are
#
# Rendering or validation failures are collected for ALL apps and reported
# together; the script exits 1 if any app failed.
#
# Environment:
#   KUBERNETES_VERSION  schema version for -kubernetes-version (default 1.37.2)
#   APPS_DIR            default argocd/apps
#   RENDER_DIR          where rendered manifests go (default: a temp dir)
#   KUBECONFORM         kubeconform binary (default: kubeconform)
#   KUBECONFORM_SKIP    comma separated kinds that are not validated (default: VMProbe)
#   ONLY                optional space separated list of app names
set -uo pipefail

APPS_DIR="${APPS_DIR:-argocd/apps}"
KUBERNETES_VERSION="${KUBERNETES_VERSION:-1.37.2}"
KUBECONFORM="${KUBECONFORM:-kubeconform}"
# VMProbe: the datree catalog still has the pre-v0.75 schema of the VictoriaMetrics
# operator (spec.targets.staticConfig). The CRD that the deployed chart ships
# (victoria-metrics-k8s-stack 0.98.x) has spec.targets.static, which
# argocd/apps/blackbox-exporter uses, so the catalog reports a false positive.
KUBECONFORM_SKIP="${KUBECONFORM_SKIP:-VMProbe}"
RENDER_DIR="${RENDER_DIR:-$(mktemp -d)}"
mkdir -p "${RENDER_DIR}"

# Schemas for the built-in kinds come from yannh/kubernetes-json-schema
# ("default"); everything else (cert-manager, MetalLB, KubeVirt, VictoriaMetrics,
# SealedSecrets, ...) from the datree CRD catalog. Kinds that are in neither are
# skipped (-ignore-missing-schemas) and listed in the summary of that app.
validate() {
  "${KUBECONFORM}" \
    -strict \
    -ignore-missing-schemas \
    -kubernetes-version "${KUBERNETES_VERSION}" \
    -schema-location default \
    -schema-location 'https://raw.githubusercontent.com/datreeio/CRDs-catalog/main/{{.Group}}/{{.ResourceKind}}_{{.ResourceAPIVersion}}.json' \
    -skip "${KUBECONFORM_SKIP}" \
    -summary \
    "$@"
}

# "helm dependency build" (as opposed to "update") needs every HTTP(S) repository
# of a Chart.lock to be registered. OCI repositories need no registration.
i=0
while read -r url; do
  i=$((i + 1))
  helm repo add --force-update "repo-${i}" "${url}" >/dev/null
done < <(grep -h '^[[:space:]]*repository:[[:space:]]*https\?://' "${APPS_DIR}"/*/Chart.yaml \
  | sed -E 's/^[[:space:]]*repository:[[:space:]]*//; s/["'"'"']//g' | sort -u)

failed=()
checked=0
for dir in "${APPS_DIR}"/*/; do
  name="$(basename "${dir}")"
  if [ -n "${ONLY:-}" ] && ! [[ " ${ONLY} " == *" ${name} "* ]]; then
    continue
  fi
  echo "::group::${name}"
  rendered="${RENDER_DIR}/${name}.yaml"
  ok=1

  if [ -f "${dir}Chart.yaml" ]; then
    kind="helm"
    if grep -q '^dependencies:' "${dir}Chart.yaml"; then
      helm dependency build "${dir}" >/dev/null || ok=0
    fi
    if [ "${ok}" = 1 ]; then
      helm template "${name}" "${dir}" > "${rendered}" || ok=0
    fi
  elif [ -f "${dir}kustomization.yaml" ]; then
    kind="kustomize"
    kubectl kustomize "${dir}" > "${rendered}" || ok=0
  else
    kind="raw"
    rendered="${dir}"
  fi

  if [ "${ok}" = 0 ]; then
    echo "::error title=render failed::${name} (${kind}) could not be rendered"
    failed+=("${name} (render)")
  else
    # A chart may legitimately render to nothing (e.g. SealedSecret templates
    # only emit a manifest once their values are set). kubeconform reads an
    # empty stream as "0 resources", which is fine.
    echo "${name} (${kind})"
    if ! validate "${rendered}"; then
      echo "::error title=schema validation failed::${name} (${kind}) has manifests that do not match their schema"
      failed+=("${name} (schema)")
    fi
  fi
  checked=$((checked + 1))
  echo "::endgroup::"
done

echo "Checked ${checked} apps."
if [ "${#failed[@]}" -gt 0 ]; then
  echo "Failed: ${failed[*]}" >&2
  exit 1
fi

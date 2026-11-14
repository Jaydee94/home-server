{{/*
Namespace-isolation NetworkPolicy "<name>-namespace-isolation": ingress is
allowed from pods in the same namespace and from Traefik (kube-system); every
other source is blocked. `namespaces` adds further allowed source namespaces.
Egress stays unrestricted. See docs/23-network-policies.md.
Usage:
  {{ include "common.networkpolicy.isolation" (dict "root" $ "name" "media" "namespaces" (list "monitoring")) }}
*/}}
{{- define "common.networkpolicy.isolation" -}}
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: {{ .name }}-namespace-isolation
  namespace: {{ .root.Release.Namespace }}
spec:
  podSelector: {}
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector: {}
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: kube-system
        {{- range .namespaces }}
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: {{ . }}
        {{- end }}
{{- end }}

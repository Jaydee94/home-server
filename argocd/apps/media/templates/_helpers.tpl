{{/*
Common labels for a media workload. Usage: {{ include "media.labels" "sonarr" }}
*/}}
{{- define "media.labels" -}}
app.kubernetes.io/name: {{ . }}
app.kubernetes.io/part-of: media
{{- end -}}

{{/*
ClusterIP Service + Traefik Ingress for a web UI.
Usage: {{ include "media.svcIngress" (dict "name" "sonarr" "port" 8989 "root" $) }}
*/}}
{{- define "media.svcIngress" -}}
{{- $root := .root -}}
apiVersion: v1
kind: Service
metadata:
  name: {{ .name }}
  labels:
    {{- include "media.labels" .name | nindent 4 }}
spec:
  type: ClusterIP
  selector:
    app.kubernetes.io/name: {{ .name }}
  ports:
    - name: http
      port: {{ .port }}
      targetPort: http
{{- if $root.Values.ingress.enabled }}
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: {{ .name }}
  labels:
    {{- include "media.labels" .name | nindent 4 }}
spec:
  ingressClassName: {{ $root.Values.ingress.className }}
  rules:
    - host: {{ .name }}.{{ $root.Values.ingress.domain }}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: {{ .name }}
                port:
                  name: http
{{- end }}
{{- end -}}

{{/*
Standard linuxserver env block (PUID/PGID/TZ + optional theme.park).
Usage: {{ include "media.lsioEnv" (dict "theme" "sonarr" "root" $) | nindent 12 }}
*/}}
{{- define "media.lsioEnv" -}}
- name: PUID
  value: {{ .root.Values.puid | quote }}
- name: PGID
  value: {{ .root.Values.pgid | quote }}
- name: TZ
  value: {{ .root.Values.timezone | quote }}
{{- if and .root.Values.theme.enabled .theme }}
- name: DOCKER_MODS
  value: ghcr.io/themepark-dev/theme.park:{{ .theme }}
- name: TP_THEME
  value: {{ .root.Values.theme.name | quote }}
{{- end }}
{{- end -}}

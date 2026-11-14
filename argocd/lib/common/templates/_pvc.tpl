{{/*
Data PVC "<fullname>-data" from .Values.persistence (enabled, accessMode, size,
storageClassName). The PVC spec is immutable and local-path deletes the data
with the claim, so do not change what this renders for a deployed chart.
Usage: {{ include "common.pvc" . }}
*/}}
{{- define "common.pvc" -}}
{{- if .Values.persistence.enabled -}}
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: {{ include "common.fullname" . }}-data
  namespace: {{ .Release.Namespace }}
  labels:
    {{- include "common.labels" . | nindent 4 }}
  annotations:
    # Never delete this claim together with the Application (Delete=false) or
    # when it disappears from the rendered manifests (Prune=false): local-path
    # would wipe the data. Remove it by hand if that is really intended.
    argocd.argoproj.io/sync-options: Delete=false,Prune=false
spec:
  accessModes:
    - {{ .Values.persistence.accessMode }}
  resources:
    requests:
      storage: {{ .Values.persistence.size }}
  storageClassName: {{ .Values.persistence.storageClassName }}
{{- end }}
{{- end }}

{{/*
Expand the name of the chart.
*/}}
{{- define "claude-agent.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "claude-agent.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "claude-agent.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "claude-agent.labels" -}}
helm.sh/chart: {{ include "claude-agent.chart" . }}
{{ include "claude-agent.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "claude-agent.selectorLabels" -}}
app.kubernetes.io/name: {{ include "claude-agent.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
ntfy selector labels
*/}}
{{- define "claude-agent.ntfy.selectorLabels" -}}
app.kubernetes.io/name: ntfy
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
NTFY base URL — uses in-cluster service when ntfy.enabled, otherwise reads from controller.ntfyUrl.
*/}}
{{- define "claude-agent.ntfyUrl" -}}
{{- if .Values.ntfy.enabled -}}
http://ntfy.{{ .Release.Namespace }}.svc.cluster.local
{{- else -}}
{{- .Values.controller.ntfyUrl | default "" }}
{{- end }}
{{- end }}

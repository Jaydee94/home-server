{{- define "ntfy.fullname" -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "ntfy.labels" -}}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{ include "ntfy.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "ntfy.selectorLabels" -}}
app.kubernetes.io/name: ntfy
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

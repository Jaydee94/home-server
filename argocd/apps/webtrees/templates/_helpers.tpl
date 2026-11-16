{{/*
MariaDB gets its own name and selector labels. It must not carry
common.selectorLabels, or the webtrees Service and Deployment would select the
database pod as well.
*/}}
{{- define "webtrees.mariadb.fullname" -}}
{{ include "common.fullname" . }}-mariadb
{{- end }}

{{- define "webtrees.mariadb.selectorLabels" -}}
app.kubernetes.io/name: {{ include "common.name" . }}-mariadb
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "webtrees.mariadb.labels" -}}
helm.sh/chart: {{ include "common.chart" . }}
{{ include "webtrees.mariadb.selectorLabels" . }}
app.kubernetes.io/component: database
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/* Name of the SealedSecret / Secret with all passwords. */}}
{{- define "webtrees.secretName" -}}
{{ include "common.fullname" . }}
{{- end }}

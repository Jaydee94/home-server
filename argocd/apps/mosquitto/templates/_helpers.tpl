{{/*
Selector-Labels des Brokers. NICHT ändern: StatefulSet-Selector und
volumeClaimTemplates sind immutable und die Services/NetworkPolicy hängen dran.
*/}}
{{- define "mosquitto.selectorLabels" -}}
app.kubernetes.io/name: mosquitto
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: broker
{{- end }}

{{- define "mosquitto.labels" -}}
{{ include "mosquitto.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: mosquitto
{{- end }}

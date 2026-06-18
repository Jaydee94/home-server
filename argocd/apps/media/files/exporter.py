#!/usr/bin/env python3
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SCRAPE_TIMEOUT = float(os.environ.get("SCRAPE_TIMEOUT", "8"))

def env(name, default=""):
  return os.environ.get(name, default).strip()

def http_json(url, headers=None):
  request = urllib.request.Request(url, headers=headers or {})
  with urllib.request.urlopen(request, timeout=SCRAPE_TIMEOUT) as response:
    return json.loads(response.read().decode("utf-8"))

def arr_headers(key):
  return {"X-Api-Key": key}

def arr_metrics(lines, app, base, key):
  if not key:
    lines.append(f'media_exporter_scrape_success{{app="{app}"}} 0')
    return
  try:
    api_version = "v1" if app == "prowlarr" else "v3"
    status = http_json(f"{base}/api/{api_version}/system/status", arr_headers(key))
    version = status.get("version", "unknown")
    lines.append(f'media_exporter_scrape_success{{app="{app}"}} 1')
    lines.append(f'media_app_info{{app="{app}",version="{version}"}} 1')
    if app == "sonarr":
      series = http_json(f"{base}/api/v3/series", arr_headers(key))
      queue = http_json(f"{base}/api/v3/queue?page=1&pageSize=1&includeUnknownSeriesItems=true", arr_headers(key))
      missing = http_json(f"{base}/api/v3/wanted/missing?page=1&pageSize=1&monitored=true", arr_headers(key))
      lines.append(f"media_sonarr_series_total {len(series)}")
      lines.append(f"media_sonarr_queue_total {queue.get('totalRecords', 0)}")
      lines.append(f"media_sonarr_missing_episodes_total {missing.get('totalRecords', 0)}")
    elif app == "radarr":
      movies = http_json(f"{base}/api/v3/movie", arr_headers(key))
      queue = http_json(f"{base}/api/v3/queue?page=1&pageSize=1&includeUnknownMovieItems=true", arr_headers(key))
      missing = sum(1 for movie in movies if not movie.get("hasFile"))
      lines.append(f"media_radarr_movies_total {len(movies)}")
      lines.append(f"media_radarr_missing_movies_total {missing}")
      lines.append(f"media_radarr_queue_total {queue.get('totalRecords', 0)}")
    elif app == "prowlarr":
      indexers = http_json(f"{base}/api/v1/indexer", arr_headers(key))
      enabled = sum(1 for indexer in indexers if indexer.get("enable", False))
      lines.append(f"media_prowlarr_indexers_total {len(indexers)}")
      lines.append(f"media_prowlarr_indexers_enabled {enabled}")
  except Exception:
    lines.append(f'media_exporter_scrape_success{{app="{app}"}} 0')

def sabnzbd_metrics(lines, base, key):
  app = "sabnzbd"
  if not key:
    lines.append(f'media_exporter_scrape_success{{app="{app}"}} 0')
    return
  try:
    params = urllib.parse.urlencode({"mode": "queue", "output": "json", "apikey": key})
    queue = http_json(f"{base}/api?{params}").get("queue", {})
    lines.append(f'media_exporter_scrape_success{{app="{app}"}} 1')
    bytes_left = float(queue.get("mbleft", 0)) * 1024 * 1024
    bytes_per_second = float(queue.get("kbpersec", 0)) * 1024
    lines.append(f"media_sabnzbd_queue_total {queue.get('noofslots_total', 0)}")
    lines.append(f"media_sabnzbd_queue_bytes_left {bytes_left}")
    lines.append(f"media_sabnzbd_download_bytes_per_second {bytes_per_second}")
    paused = 1 if str(queue.get("paused", "")).lower() in ("true", "1", "yes") else 0
    lines.append(f"media_sabnzbd_paused {paused}")
  except Exception:
    lines.append(f'media_exporter_scrape_success{{app="{app}"}} 0')

def jellyfin_metrics(lines, base, key):
  app = "jellyfin"
  if not key:
    lines.append(f'media_exporter_configured{{app="{app}"}} 0')
    return
  try:
    lines.append(f'media_exporter_configured{{app="{app}"}} 1')
    headers = {"X-Emby-Token": key}
    sessions = http_json(f"{base}/Sessions", headers)
    active = sum(1 for session in sessions if session.get("NowPlayingItem"))
    lines.append(f'media_exporter_scrape_success{{app="{app}"}} 1')
    lines.append(f"media_jellyfin_sessions_total {len(sessions)}")
    lines.append(f"media_jellyfin_active_streams_total {active}")
  except Exception:
    lines.append(f'media_exporter_scrape_success{{app="{app}"}} 0')

def metrics():
  lines = [
    "# HELP media_exporter_scrape_success Whether the app API scrape succeeded.",
    "# TYPE media_exporter_scrape_success gauge",
    "# TYPE media_exporter_configured gauge",
    "# TYPE media_app_info gauge",
    "# TYPE media_sonarr_series_total gauge",
    "# TYPE media_sonarr_queue_total gauge",
    "# TYPE media_sonarr_missing_episodes_total gauge",
    "# TYPE media_radarr_movies_total gauge",
    "# TYPE media_radarr_missing_movies_total gauge",
    "# TYPE media_radarr_queue_total gauge",
    "# TYPE media_prowlarr_indexers_total gauge",
    "# TYPE media_prowlarr_indexers_enabled gauge",
    "# TYPE media_sabnzbd_queue_total gauge",
    "# TYPE media_sabnzbd_queue_bytes_left gauge",
    "# TYPE media_sabnzbd_download_bytes_per_second gauge",
    "# TYPE media_sabnzbd_paused gauge",
    "# TYPE media_jellyfin_sessions_total gauge",
    "# TYPE media_jellyfin_active_streams_total gauge",
  ]
  arr_metrics(lines, "sonarr", env("SONARR_URL", "http://sonarr:8989"), env("SONARR_API_KEY"))
  arr_metrics(lines, "radarr", env("RADARR_URL", "http://radarr:7878"), env("RADARR_API_KEY"))
  arr_metrics(lines, "prowlarr", env("PROWLARR_URL", "http://prowlarr:9696"), env("PROWLARR_API_KEY"))
  sabnzbd_metrics(lines, env("SABNZBD_URL", "http://sabnzbd:8080"), env("SABNZBD_API_KEY"))
  jellyfin_metrics(lines, env("JELLYFIN_URL", "http://jellyfin.jellyfin.svc.cluster.local:8096"), env("JELLYFIN_API_KEY"))
  lines.append(f"media_exporter_last_scrape_timestamp_seconds {int(time.time())}")
  return "\n".join(lines) + "\n"

class Handler(BaseHTTPRequestHandler):
  def do_GET(self):
    if self.path == "/healthz":
      self.send_response(200)
      self.end_headers()
      self.wfile.write(b"ok\n")
      return
    if self.path != "/metrics":
      self.send_response(404)
      self.end_headers()
      return
    body = metrics().encode("utf-8")
    self.send_response(200)
    self.send_header("Content-Type", "text/plain; version=0.0.4")
    self.send_header("Content-Length", str(len(body)))
    self.end_headers()
    self.wfile.write(body)

  def log_message(self, fmt, *args):
    return

ThreadingHTTPServer(("", int(env("PORT", "9108"))), Handler).serve_forever()

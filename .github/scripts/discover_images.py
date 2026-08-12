#!/usr/bin/env python3
"""Extract unique container image references from rendered Helm manifests.

Walks every YAML document under `manifests_dir` recursively (not
kind-specific), so it catches images anywhere in the tree: containers,
initContainers, CronJob/Job pod templates, KubeVirt VirtualMachine specs,
etc. One image reference per line is printed to stdout, sorted.
"""

import argparse
import glob
import os
import re
import sys

import yaml

IMAGE_REF_RE = re.compile(r"^[\w.\-]+(/[\w.\-]+)*(:[\w.\-]+)?(@sha256:[0-9a-f]{64})?$")

# Some charts (e.g. csi-driver-smb) ship a Windows-node variant of an image
# alongside the Linux one, tagged like "v1.20.3-windows-hp". Trivy can't
# resolve those on a Linux runner (no linux/amd64 child in the manifest
# index) and hard-fails instead of just reporting 0 vulnerabilities — and
# this cluster is Linux-only anyway, so skip them.
WINDOWS_VARIANT_RE = re.compile(r"-windows(-|$)", re.IGNORECASE)


def walk(node, images):
    if isinstance(node, dict):
        for key, value in node.items():
            if (
                key == "image"
                and isinstance(value, str)
                and IMAGE_REF_RE.match(value)
                and not WINDOWS_VARIANT_RE.search(value)
            ):
                images.add(value)
            else:
                walk(value, images)
    elif isinstance(node, list):
        for item in node:
            walk(item, images)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifests_dir", help="Directory of rendered *.yaml manifests")
    args = parser.parse_args()

    images = set()
    for path in glob.glob(os.path.join(args.manifests_dir, "*.yaml")):
        with open(path) as handle:
            try:
                for doc in yaml.safe_load_all(handle):
                    walk(doc, images)
            except yaml.YAMLError as exc:
                print(f"WARNING: failed to parse {path}: {exc}", file=sys.stderr)
                continue

    for image in sorted(images):
        print(image)


if __name__ == "__main__":
    main()

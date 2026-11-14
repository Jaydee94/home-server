#!/usr/bin/env python3
"""Extract unique container image references from rendered Helm manifests.

Walks every YAML document under `manifests_dir` recursively (not
kind-specific), so it catches images anywhere in the tree: containers,
initContainers, CronJob/Job pod templates, KubeVirt VirtualMachine specs,
etc. One image reference per line is printed to stdout, sorted.

With --categories the output is one JSON object {image: category} instead.
`category` is the SARIF category of that image's scan and must stay the same
from run to run, or code scanning cannot match old alerts to new results. It
is therefore derived from the image NAME only (registry + repository, no
tag, no digest): a version bump keeps the category, and adding or removing
some other image does not shift it.
"""

import argparse
import glob
import json
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

CATEGORY_PREFIX = "trivy-image-"


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


def image_name(image):
    """Strip digest and tag: 'ghcr.io/a/b:1.2@sha256:…' -> 'ghcr.io/a/b'."""
    name = image.split("@", 1)[0]
    # A colon in the last path segment is the tag separator; a colon further
    # left belongs to a registry port ("registry:5000/a/b").
    if ":" in name.rsplit("/", 1)[-1]:
        name = name.rsplit(":", 1)[0]
    return name


def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def build_categories(images):
    """Return {image: category} with one unique category per image."""
    by_name = {}
    for image in sorted(images):
        by_name.setdefault(image_name(image), []).append(image)

    categories = {}
    for name, refs in sorted(by_name.items()):
        for ref in refs:
            category = CATEGORY_PREFIX + slug(name)
            if len(refs) > 1:
                # The same image is deployed in more than one version. One
                # shared category would make the scans overwrite each other,
                # so these (rare) cases carry the tag too. Their category
                # changes on a version bump, which is the lesser evil.
                category += "--" + (slug(ref[len(name):]) or "untagged")
            categories[ref] = category

    values = list(categories.values())
    duplicates = sorted({c for c in values if values.count(c) > 1})
    if duplicates:
        raise SystemExit(f"ERROR: SARIF categories are not unique: {duplicates}")
    return categories


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifests_dir", help="Directory of rendered *.yaml manifests")
    parser.add_argument(
        "--categories",
        action="store_true",
        help="Print a JSON object {image: SARIF category} instead of plain lines",
    )
    args = parser.parse_args()

    images = set()
    failed = []
    for path in sorted(glob.glob(os.path.join(args.manifests_dir, "*.yaml"))):
        with open(path) as handle:
            try:
                for doc in yaml.safe_load_all(handle):
                    walk(doc, images)
            except yaml.YAMLError as exc:
                print(f"ERROR: failed to parse {path}: {exc}", file=sys.stderr)
                failed.append(path)

    if failed:
        # An unparseable manifest means its images silently drop out of the
        # scan — fail instead of reporting a scan that looks complete.
        raise SystemExit(f"ERROR: {len(failed)} rendered manifest(s) could not be parsed")

    if args.categories:
        print(json.dumps(build_categories(images)))
    else:
        for image in sorted(images):
            print(image)


if __name__ == "__main__":
    main()

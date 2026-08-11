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

import yaml

IMAGE_REF_RE = re.compile(r"^[\w.\-]+(/[\w.\-]+)*(:[\w.\-]+)?(@sha256:[0-9a-f]{64})?$")


def walk(node, images):
    if isinstance(node, dict):
        for key, value in node.items():
            if key == "image" and isinstance(value, str) and IMAGE_REF_RE.match(value):
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
            except yaml.YAMLError:
                continue

    for image in sorted(images):
        print(image)


if __name__ == "__main__":
    main()

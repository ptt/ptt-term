#!/usr/bin/env python3
"""Load site deployment configurations from .github/workflows/sites/*.yml."""

import glob
import json
import os
import sys
import yaml

REQUIRED_FIELDS = [
    'CNAME',
    'TARGET_REPO',
    'DEFAULT_SITE',
    'DEV_PROXY_TARGET',
    'DEV_PROXY_HEADER',
]


def load_sites(sites_dir=None):
    if not sites_dir:
        sites_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sites')

    if not os.path.isdir(sites_dir):
        raise FileNotFoundError(f'Sites directory not found: {sites_dir}')

    pattern_yml = os.path.join(sites_dir, '*.yml')
    pattern_yaml = os.path.join(sites_dir, '*.yaml')
    file_paths = sorted(glob.glob(pattern_yml) + glob.glob(pattern_yaml))

    sites = []
    for fpath in file_paths:
        fname = os.path.basename(fpath)
        # Ignore hidden, template, or sample files
        if fname.startswith(('_', '.')):
            continue
        if any(
            fname.endswith(s)
            for s in (
                '.sample.yml',
                '.sample.yaml',
                '.example.yml',
                '.example.yaml',
                '.template.yml',
                '.template.yaml',
            )
        ):
            continue

        with open(fpath, 'r', encoding='utf-8') as fp:
            data = yaml.safe_load(fp)

        if not isinstance(data, dict):
            continue

        if data.get('enabled') is False:
            print(f'Skipping disabled site: {fname}', file=sys.stderr)
            continue

        site_id = str(data.get('SITE_ID') or os.path.splitext(fname)[0])
        data['SITE_ID'] = site_id

        # Check required fields
        missing = [f for f in REQUIRED_FIELDS if not data.get(f)]
        if missing:
            raise ValueError(
                f"Site config '{fname}' is missing required fields: {', '.join(missing)}"
            )

        # Normalize defaults
        data.setdefault('THEME', '')
        data.setdefault('PAGE_TITLE', '')
        data.setdefault('PAGE_SHORT_NAME', '')
        data.setdefault('PAGE_DESCRIPTION', '')
        data.setdefault('BRANCH', 'gh-pages')
        data.setdefault('SITE_TYPE', 'auto')

        # DYNAMIC_TITLE must be string 'true' or 'false'
        dynamic_title = data.get('DYNAMIC_TITLE', 'false')
        data['DYNAMIC_TITLE'] = str(dynamic_title).lower()

        # Normalize token secret
        token_secret = data.get('DEPLOY_TOKEN_SECRET')
        if not token_secret and isinstance(data.get('secrets-id'), dict):
            token_secret = data['secrets-id'].get('deploy-token')
        data['DEPLOY_TOKEN_SECRET'] = str(token_secret or '')

        # Ensure all scalar values are strings to match GitHub Actions type: string
        for k, v in list(data.items()):
            if isinstance(v, (str, int, float, bool)):
                data[k] = str(v)

        sites.append(data)

    if not sites:
        raise ValueError(f'No valid site configuration found in {sites_dir}')

    return sites


def main():
    sites_dir = None
    validate_only = False

    for arg in sys.argv[1:]:
        if arg in ('--validate', '--test'):
            validate_only = True
        elif not arg.startswith('-'):
            sites_dir = arg

    try:
        sites = load_sites(sites_dir)
    except Exception as e:
        print(f'Error loading sites: {e}', file=sys.stderr)
        sys.exit(1)

    print(f'Loaded {len(sites)} site configuration(s):', file=sys.stderr)
    for s in sites:
        print(
            f"  - {s['SITE_ID']}: CNAME={s['CNAME']} -> {s['TARGET_REPO']}",
            file=sys.stderr,
        )

    if not validate_only:
        matrix = {'site': sites}
        print(f"matrix={json.dumps(matrix)}")


if __name__ == '__main__':
    main()

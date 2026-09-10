#!/usr/bin/env python3
"""Load site deployment configurations from .github/workflows/sites/*.yml."""

import argparse
import glob
import json
import os
import sys
import yaml

REQUIRED_FIELDS = [
    'CNAME',
    'TARGET_REPO',
    'SITE_URL',
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
        data.setdefault('APP_TITLE', '')
        data.setdefault('APP_SHORT_NAME', '')
        data.setdefault('APP_DESCRIPTION', '')
        data.setdefault('BRANCH', 'gh-pages')
        data.setdefault('SITE_TYPE', 'auto')
        data.setdefault('DEPLOY_BRANCH', '')

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


def filter_sites(sites, branch=None, target_site='auto'):
    """Filter sites based on target_site and/or triggering branch."""
    target_site = (target_site or 'auto').strip()
    branch = (branch or '').strip()

    if target_site and target_site not in ('auto', 'all'):
        matched = [s for s in sites if s['SITE_ID'] == target_site]
        if not matched:
            valid_ids = ', '.join(s['SITE_ID'] for s in sites)
            raise ValueError(
                f"Unknown site '{target_site}'. Available sites: {valid_ids}"
            )
        return matched

    if target_site == 'all':
        return list(sites)

    # auto mode: filter by branch if branch is provided
    if not branch:
        return list(sites)

    filtered = []
    for s in sites:
        site_branch = s.get('DEPLOY_BRANCH', '').strip()
        # If site specifies DEPLOY_BRANCH, only match if branch equals DEPLOY_BRANCH.
        # If site doesn't specify DEPLOY_BRANCH, match any branch.
        if not site_branch or site_branch == branch:
            filtered.append(s)
    return filtered


def parse_args():
    parser = argparse.ArgumentParser(
        description='Load site deployment configurations from .github/workflows/sites/*.yml'
    )
    parser.add_argument(
        'sites_dir_pos',
        nargs='?',
        default=None,
        help='Optional path to sites directory',
    )
    parser.add_argument(
        '--sites-dir',
        dest='sites_dir_opt',
        default=None,
        help='Path to sites directory',
    )
    parser.add_argument(
        '--validate',
        '--test',
        action='store_true',
        help='Validate site configurations only',
    )
    parser.add_argument(
        '--branch',
        default='',
        help='Triggering git branch (e.g. prod, beta)',
    )
    parser.add_argument(
        '--site',
        default='auto',
        help='Site ID to deploy, or "auto" / "all"',
    )
    return parser.parse_args()


def main():
    args = parse_args()
    sites_dir = args.sites_dir_opt or args.sites_dir_pos

    try:
        all_sites = load_sites(sites_dir)
        filtered_sites = filter_sites(
            all_sites,
            branch=args.branch,
            target_site=args.site,
        )
    except Exception as e:
        print(f'Error loading sites: {e}', file=sys.stderr)
        sys.exit(1)

    print(
        f'Loaded {len(all_sites)} site configuration(s) from {sites_dir or "default"}:',
        file=sys.stderr,
    )
    for s in all_sites:
        print(
            f"  - {s['SITE_ID']}: CNAME={s['CNAME']} -> {s['TARGET_REPO']} (deploy_branch={s.get('DEPLOY_BRANCH') or '*'})",
            file=sys.stderr,
        )

    print(
        f'Filtered to {len(filtered_sites)} site(s) (branch={args.branch!r}, site={args.site!r}):',
        file=sys.stderr,
    )
    for s in filtered_sites:
        print(
            f"  * {s['SITE_ID']}: CNAME={s['CNAME']} -> {s['TARGET_REPO']}",
            file=sys.stderr,
        )

    if not args.validate:
        has_sites = 'true' if filtered_sites else 'false'
        print(f'has_sites={has_sites}')
        matrix = {'site': filtered_sites}
        print(f'matrix={json.dumps(matrix)}')


if __name__ == '__main__':
    main()

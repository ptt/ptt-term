# Site Deployment Configurations

This directory contains configuration files for BBS sites deployed via GitHub Actions (`deploy.yml`).

Each `.yml` or `.yaml` file defines a target deployment site. The workflow automatically discovers all YAML files in this directory and builds each site as part of a matrix job.

## How to Add a New Site

Create a new file `<site-id>.yml` in this directory (e.g. `ptt.yml`, `mysite.yml`):

```yaml
CNAME: 'term.mysite.com'
TARGET_REPO: 'your-org/term.mysite.com'
SITE_URL: 'wss://ws.mysite.com/bbs'
DEV_PROXY_TARGET: 'https://ws.mysite.com'
DEV_PROXY_HEADER: 'https://term.mysite.com'
APP_TITLE: 'My BBS'
APP_SHORT_NAME: 'MyBBS'
APP_DESCRIPTION: 'MyBBS provides rich contents.'
SITE_TYPE: 'ptt'       # 'ptt', 'maple3', or 'auto' (default: 'auto')
THEME: 'default'       # Theme name matching src/icon/<THEME> (default: 'default')
DYNAMIC_TITLE: 'false' # 'true' or 'false' (default: 'false')
BRANCH: 'gh-pages'     # Target branch in TARGET_REPO (default: 'gh-pages')
# DEFAULT_PLUGINS:     # Override default enabled/disabled state for plugins (optional)
#   easy_reading: true
#   mouse_browsing: false
# DEPLOY_BRANCH: 'prod' # Source branch in this repository triggering deployment (optional)
# DEPLOY_TOKEN_SECRET: 'GH_PAT_MYSITE' # Secret name in repository secrets (optional)
# enabled: true        # Set to false to temporarily skip building this site
```

## Field Reference

| Field | Required | Default | Description |
|---|---|---|---|
| `CNAME` | **Yes** | - | Custom domain for GitHub Pages |
| `TARGET_REPO` | **Yes** | - | Target GitHub repository (`owner/repo`) |
| `SITE_URL` | **Yes** | - | WebSocket BBS connection URL |
| `DEV_PROXY_TARGET` | **Yes** | - | Development proxy target URL |
| `DEV_PROXY_HEADER` | **Yes** | - | Development proxy Origin header URL |
| `APP_TITLE` | No | `WebSocket Terminal` | Browser tab title and PWA manifest title |
| `APP_SHORT_NAME` | No | `WSTerm` | PWA manifest short name |
| `APP_DESCRIPTION` | No | Default description | Search engine & PWA description |
| `SITE_TYPE` | No | `auto` | BBS site protocol handler (`ptt`, `maple3`, `auto`) |
| `THEME` | No | `default` | Theme folder name under `src/icon/` |
| `DYNAMIC_TITLE` | No | `false` | Whether to update window title with current BBS screen |
| `BRANCH` | No | `gh-pages` | Target branch in `TARGET_REPO` |
| `DEFAULT_PLUGINS` | No | Built-in defaults | Map (or comma-separated `+plugin, -plugin` string) overriding default plugin states |
| `DEPLOY_BRANCH` | No | `*` (any branch) | Source branch in this repository triggering deployment (`prod`, `beta`, etc.) |
| `DEPLOY_TOKEN_SECRET`| No | `GH_PAT` / `GITHUB_TOKEN` | Repository secret name for deploy token |
| `enabled` | No | `true` | Set to `false` to disable deploying this site |

import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode, command }) => {
  const isProduction = mode === 'production';
  const isDevelopment = !isProduction;
  const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'));

  const theme = process.env.APP_THEME || process.env.THEME || 'default';
  const appTitle = process.env.APP_TITLE || 'WebSocket Terminal';
  const appShortName = process.env.APP_SHORT_NAME || 'WSTerm';
  const appDescription =
    process.env.APP_DESCRIPTION ||
    'A web client for connecting to the ANSI based terminals via WebSockets.';
  const dynamicTitle = process.env.DYNAMIC_TITLE ?? 'true';
  const siteUrl = process.env.SITE_URL;

  const getCommitHash = () => {
    if (process.env.COMMIT_HASH) return process.env.COMMIT_HASH;
    if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 8);
    try {
      return execSync('git rev-parse --short HEAD', {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {
      return '';
    }
  };

  const getBuildDate = () => {
    if (process.env.BUILD_DATE) return process.env.BUILD_DATE;
    return new Date().toISOString().slice(0, 10);
  };

  const resolveThemeIcon = (name, fallbackName = null) => {
    const themePath = path.resolve(__dirname, `src/icon/${theme}/${name}`);
    if (fs.existsSync(themePath)) return themePath;
    const defaultPath = path.resolve(__dirname, `src/icon/default/${name}`);
    if (fs.existsSync(defaultPath)) return defaultPath;
    if (fallbackName) return resolveThemeIcon(fallbackName);
    return path.resolve(__dirname, `src/icon/default/${name}`);
  };
  const buildManifest = () => ({
    name: appTitle,
    short_name: appShortName,
    description: appDescription,
    start_url: './',
    scope: './',
    display: 'standalone',
    background_color: '#000000',
    theme_color: '#000000',
    orientation: 'any',
    launch_handler: {
      client_mode: 'focus-existing',
    },
    icons: [
      {
        src: 'icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: 'icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: 'icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  });

  return {
    base: './',
    ...(command === 'serve' && {
        oxc: {
            include: /\.[cm]?[tj]sx?$/,
            exclude: /node_modules/,
            lang: 'jsx',
        },
    }),
    plugins: [
      {
        name: 'icon-resolver',
        resolveId(id) {
          if (id.startsWith('Icon/')) {
            const rel = id.slice(5);
            const themeFile = path.resolve(__dirname, `src/icon/${theme}/${rel}`);
            if (fs.existsSync(themeFile)) {
              return themeFile;
            }
            return path.resolve(__dirname, `src/icon/${rel}`);
          }
        },
      },
      preact(),
      {
        name: 'html-transform',
        transformIndexHtml: {
          order: 'pre',
          handler(html) {
            const faviconFile = path.resolve(__dirname, `src/icon/${theme}/logo.png`);
            const faviconPath = fs.existsSync(faviconFile)
              ? `/src/icon/${theme}/logo.png`
              : '/src/icon/default/logo.png';
            return html
              .replace(/%APP_TITLE%/g, appTitle)
              .replace(/%APP_SHORT_NAME%/g, appShortName)
              .replace(/%APP_DESCRIPTION%/g, appDescription)
              .replace(/%APP_FAVICON%/g, faviconPath);
          },
        },
      },
      {
        name: 'pwa-manifest',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            const url = req.url?.split('?')[0];
            if (url === '/manifest.webmanifest') {
              res.setHeader('Content-Type', 'application/manifest+json');
              res.end(JSON.stringify(buildManifest(), null, 2));
              return;
            }
            if (url === '/icon-192.png') {
              res.setHeader('Content-Type', 'image/png');
              fs.createReadStream(resolveThemeIcon('icon_192.png')).pipe(res);
              return;
            }
            if (url === '/icon-512.png') {
              res.setHeader('Content-Type', 'image/png');
              fs.createReadStream(resolveThemeIcon('icon_512.png')).pipe(res);
              return;
            }
            if (url === '/icon-maskable-512.png') {
              res.setHeader('Content-Type', 'image/png');
              fs.createReadStream(resolveThemeIcon('icon_maskable_512.png', 'icon_512.png')).pipe(res);
              return;
            }
            if (url === '/apple-touch-icon.png') {
              res.setHeader('Content-Type', 'image/png');
              fs.createReadStream(resolveThemeIcon('apple_touch_icon.png', 'icon_192.png')).pipe(res);
              return;
            }
            if (url === '/sw.js') {
              res.setHeader('Content-Type', 'application/javascript');
              fs.createReadStream(path.resolve(__dirname, 'src/sw.js')).pipe(res);
              return;
            }
            next();
          });
        },
        generateBundle() {
          this.emitFile({
            type: 'asset',
            fileName: 'manifest.webmanifest',
            source: JSON.stringify(buildManifest(), null, 2),
          });
          this.emitFile({
            type: 'asset',
            fileName: 'icon-192.png',
            source: fs.readFileSync(resolveThemeIcon('icon_192.png')),
          });
          this.emitFile({
            type: 'asset',
            fileName: 'icon-512.png',
            source: fs.readFileSync(resolveThemeIcon('icon_512.png')),
          });
          this.emitFile({
            type: 'asset',
            fileName: 'icon-maskable-512.png',
            source: fs.readFileSync(resolveThemeIcon('icon_maskable_512.png', 'icon_512.png')),
          });
          this.emitFile({
            type: 'asset',
            fileName: 'apple-touch-icon.png',
            source: fs.readFileSync(resolveThemeIcon('apple_touch_icon.png', 'icon_192.png')),
          });
          this.emitFile({
            type: 'asset',
            fileName: 'sw.js',
            source: fs.readFileSync(path.resolve(__dirname, 'src/sw.js'), 'utf-8'),
          });
        },
      },
    ],
    define: {
      'process.env.APP_TITLE': JSON.stringify(appTitle),
      'process.env.DYNAMIC_TITLE': JSON.stringify(dynamicTitle !== 'false'),
      'process.env.SITE_URL': JSON.stringify(
        isProduction ? siteUrl || 'wss://ws.ptt.cc/bbs' : '/bbs'
      ),
      'process.env.ALLOW_OVERRIDE_FROM_QUERY': JSON.stringify(
        isDevelopment || process.env.ALLOW_OVERRIDE_FROM_QUERY === 'yes'
      ),
      'process.env.DEVELOPER_MODE': JSON.stringify(isDevelopment),
      'process.env.SITE_TYPE': JSON.stringify(process.env.SITE_TYPE || 'auto'),
      ...(() => {
        const appInfo = {
          NAME: process.env.npm_package_name || pkg.name,
          VERSION: process.env.npm_package_version || pkg.version,
          COMMIT_HASH: getCommitHash(),
          BUILD_DATE: getBuildDate(),
          GITHUB_REPOSITORY_OWNER: process.env.GITHUB_REPOSITORY_OWNER || 'ptt',
          GITHUB_REPOSITORY: process.env.GITHUB_REPOSITORY || 'ptt/ptt-term',
        };
        return {
          APP: JSON.stringify(appInfo),
          'APP.NAME': JSON.stringify(appInfo.NAME),
          'APP.VERSION': JSON.stringify(appInfo.VERSION),
          'APP.COMMIT_HASH': JSON.stringify(appInfo.COMMIT_HASH),
          'APP.BUILD_DATE': JSON.stringify(appInfo.BUILD_DATE),
          'APP.GITHUB_REPOSITORY_OWNER': JSON.stringify(appInfo.GITHUB_REPOSITORY_OWNER),
          'APP.GITHUB_REPOSITORY': JSON.stringify(appInfo.GITHUB_REPOSITORY),
        };
      })(),
    },
    server: {
      port: 8080,
      allowedHosts: true,
      proxy: {
        '/bbs': {
          target: process.env.DEV_PROXY_TARGET || 'https://ws.ptt.cc',
          secure: true,
          ws: true,
          changeOrigin: true,
          configure: (proxy) => {
            proxy.on('proxyReqWs', (proxyReq) => {
              proxyReq.setHeader('origin', process.env.DEV_PROXY_HEADER || 'https://term.ptt.cc');
            });
          },
        },
      },
    },
    optimizeDeps: {
      entries: ['index.html'],
      rolldownOptions: {
        moduleTypes: {
          '.js': 'jsx',
        },
      },
    },
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      sourcemap: true,
      emptyOutDir: false,
      rollupOptions: {
        moduleTypes: {
          '.js': 'jsx',
        },
      },
    },
  };
});

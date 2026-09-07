import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
  const isProduction = mode === 'production';
  const isDevelopment = !isProduction;
  const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'));

  return {
    base: './',
    plugins: [
      {
        name: 'icon-resolver',
        resolveId(id) {
          if (id.startsWith('Icon/')) {
            const rel = id.slice(5);
            const theme = process.env.PTTCHROME_THEME || 'default';
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
            const theme = process.env.PTTCHROME_THEME || 'default';
            let faviconPath = `/src/icon/${theme}/logo.png`;
            if (!fs.existsSync(path.resolve(__dirname, `src/icon/${theme}/logo.png`))) {
              faviconPath = '/src/icon/default/logo.png';
            }
            return html
              .replace(/%PTTCHROME_PAGE_TITLE%/g, process.env.PTTCHROME_PAGE_TITLE || 'PttChrome')
              .replace(
                /%PTTCHROME_PAGE_DESCRIPTION%/g,
                process.env.PTTCHROME_PAGE_DESCRIPTION ||
                  'A web client for connecting to the ANSI based terminals.'
              )
              .replace(/%PTTCHROME_FAVICON%/g, faviconPath);
          },
        },
      },
    ],
    define: {
      'process.env.PTTCHROME_PAGE_TITLE': JSON.stringify(process.env.PTTCHROME_PAGE_TITLE || 'PttChrome'),
      'process.env.PTTCHROME_PAGE_DESCRIPTION': JSON.stringify(
        process.env.PTTCHROME_PAGE_DESCRIPTION || 'A web client for connecting to the ANSI based terminals.'
      ),
      'process.env.PTTCHROME_DYNAMIC_TITLE': JSON.stringify(process.env.PTTCHROME_DYNAMIC_TITLE !== 'false'),
      'process.env.DEFAULT_SITE': JSON.stringify(
        isProduction
          ? process.env.DEFAULT_SITE || 'wss://ws.ptt.cc/bbs'
          : 'ws://localhost:8080/bbs'
      ),
      'process.env.ALLOW_OVERRIDE_FROM_QUERY': JSON.stringify(
        isDevelopment || process.env.ALLOW_OVERRIDE_FROM_QUERY === 'yes'
      ),
      'process.env.DEVELOPER_MODE': JSON.stringify(isDevelopment),
      'process.env.SITE_TYPE': JSON.stringify(process.env.SITE_TYPE || 'auto'),
      'PTTCHROME.NAME': JSON.stringify(process.env.npm_package_name || pkg.name),
      'PTTCHROME.VERSION': JSON.stringify(process.env.npm_package_version || pkg.version),
      'PTTCHROME.GITHUB_REPOSITORY_OWNER': JSON.stringify(process.env.GITHUB_REPOSITORY_OWNER || 'ptt'),
      'PTTCHROME.GITHUB_REPOSITORY': JSON.stringify(process.env.GITHUB_REPOSITORY || 'ptt/ptt-term'),
    },
    server: {
      port: 8080,
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

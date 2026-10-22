/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Inlines the built script and stylesheet into index.html so the whole app is
 * one file, then also emits `artifact.html`: the same page without the
 * doctype/html/head/body wrapper, which is the shape a Claude artifact expects.
 */
function singleFile(): Plugin {
  return {
    name: 'personal-hq-single-file',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const page = bundle['index.html'];
      if (!page || page.type !== 'asset') return;
      let html = String(page.source);
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (chunk.type === 'chunk' && chunk.isEntry) {
          const tag = new RegExp(`<script[^>]*src="[^"]*${escape(fileName)}"[^>]*></script>`);
          const code = chunk.code.replace(/<\/script/gi, '<\\/script');
          html = html.replace(tag, () => `<script type="module">${code}</script>`);
          delete bundle[fileName];
        } else if (chunk.type === 'asset' && fileName.endsWith('.css')) {
          const tag = new RegExp(`<link[^>]*href="[^"]*${escape(fileName)}"[^>]*>`);
          html = html.replace(tag, () => `<style>${String(chunk.source)}</style>`);
          delete bundle[fileName];
        }
      }
      page.source = html;

      const head = /<head>([\s\S]*)<\/head>/i.exec(html)?.[1] ?? '';
      const body = /<body>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? '';
      // The artifact viewer can't install apps or run service workers, so the
      // install-related tags stay in the hosted build only.
      const artifactHead = head
        .replace(/<meta charset[^>]*>/i, '')
        .replace(/<meta name="viewport"[^>]*>/i, '')
        .replace(/<link rel="(manifest|apple-touch-icon)"[^>]*>\s*/gi, '')
        .replace(/<meta name="(apple-mobile-web-app-[a-z-]+|mobile-web-app-capable)"[^>]*>\s*/gi, '')
        .trim();
      this.emitFile({ type: 'asset', fileName: 'artifact.html', source: `${artifactHead}\n${body.trim()}\n` });
    },
  };
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), singleFile()],
  build: {
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    cssCodeSplit: false,
    modulePreload: false,
    chunkSizeWarningLimit: 2000,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});

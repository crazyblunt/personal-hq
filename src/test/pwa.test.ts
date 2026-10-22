import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');

describe('installable app files', () => {
  const manifest = JSON.parse(readFileSync(resolve(root, 'public/manifest.webmanifest'), 'utf8'));

  it('has what browsers need to offer "Install"', () => {
    expect(manifest).toMatchObject({ name: 'Personal HQ', start_url: './', scope: './', display: 'standalone' });
    const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
    expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
    expect(manifest.icons.some((i: { purpose: string }) => i.purpose === 'maskable')).toBe(true);
  });

  it('points only at files that exist, with relative paths that work under any folder', () => {
    const paths = [...manifest.icons.map((i: { src: string }) => i.src), 'icons/apple-touch-icon.png', 'sw.js'];
    for (const p of paths) {
      expect(p.startsWith('/')).toBe(false);
      expect(existsSync(resolve(root, 'public', p))).toBe(true);
    }
    for (const s of manifest.shortcuts) expect(s.url).toMatch(/^\.\/#[a-z]+$/);
  });

  it('links the manifest and touch icon from the page', () => {
    const html = readFileSync(resolve(root, 'index.html'), 'utf8');
    expect(html).toContain('<link rel="manifest" href="./manifest.webmanifest" />');
    expect(html).toContain('<link rel="apple-touch-icon" href="./icons/apple-touch-icon.png" />');
  });
});

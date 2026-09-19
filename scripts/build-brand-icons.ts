import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { resource } from '../server/runtime.js';

// The committed vectors are the source of truth. This exports their pixels;
// it does not regenerate or reinterpret the approved design.
if (process.platform !== 'darwin') throw new Error('Building .icns files requires macOS iconutil.');
const iconset = resource('.build/brand/AppIcon.iconset');
const destination = resource('desktop/Assets');
await mkdir(iconset, { recursive: true });
await mkdir(destination, { recursive: true });
const icon = await readFile(resource('src/brand/app-icon.svg'), 'utf8');
const menu = await readFile(resource('src/brand/menu-bar.svg'), 'utf8');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  async function render(svg: string, width: number, height: number, path: string) {
    await page.setViewportSize({ width, height });
    await page.setContent(
      '<style>html,body{margin:0;background:transparent}svg{display:block;width:100%;height:100%}</style>' +
        svg,
    );
    await page.screenshot({ path, omitBackground: true });
  }
  for (const size of [16, 32, 128, 256, 512]) {
    for (const scale of [1, 2]) {
      const suffix = scale === 2 ? '@2x' : '';
      await render(
        icon,
        size * scale,
        size * scale,
        join(iconset, `icon_${size}x${size}${suffix}.png`),
      );
    }
  }
  await render(menu, 22, 16, join(destination, 'MenuBarTemplate.png'));
  await render(menu, 44, 32, join(destination, 'MenuBarTemplate@2x.png'));
  await writeFile(
    resource('docs/assets/duke-autorouter-app-icon.png'),
    await readFile(join(iconset, 'icon_512x512@2x.png')),
  );
} finally {
  await browser.close();
}
execFileSync('/usr/bin/iconutil', ['-c', 'icns', iconset, '-o', join(destination, 'AppIcon.icns')]);
console.log('Exported the Mac app icon and 1x/2x menu bar templates from the committed SVGs.');

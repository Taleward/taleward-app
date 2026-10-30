import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, readdirSync } from 'node:fs';
import type { Plugin } from 'vite';

/**
 * Hilfsdateien für den PDF-Leser (pdf.js) mit ausliefern: Wasm-Decoder für gescannte Seiten (JBIG2, JPEG 2000,
 * Farbprofile) und die Standardschriften. Liegen unter <base>/pdfjs/, damit PDFs auch ohne Netz lesbar sind.
 * Bewusst nicht dabei: quickjs-eval (Skripte in PDFs) – PDF-Skripte führt die App nie aus.
 */
function pdfjsAssets(): Plugin {
  const root = new URL('./node_modules/pdfjs-dist/', import.meta.url);
  const pick: Record<string, (name: string) => boolean> = {
    wasm: (n) => !n.startsWith('quickjs'),
    standard_fonts: () => true
  };
  return {
    name: 'taleward-pdfjs-assets',
    apply: 'build',
    generateBundle() {
      for (const [dir, ok] of Object.entries(pick)) {
        for (const name of readdirSync(new URL(`${dir}/`, root))) {
          if (!ok(name)) continue;
          this.emitFile({ type: 'asset', fileName: `pdfjs/${dir}/${name}`, source: readFileSync(new URL(`${dir}/${name}`, root)) });
        }
      }
    }
  };
}

// App-Version aus package.json – eine Quelle für App, Server-Abgleich und Android (versionName/versionCode)
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    // Web-Fassung liegt unter /app/ (zentrale Website oder eigener Server), Android/Testmodus an der Wurzel
    base: env.VITE_BASE || '/',
    plugins: [react(), pdfjsAssets()],
    define: { __APP_VERSION__: JSON.stringify(pkg.version) },
    server: { host: true, port: 5173 }
  };
});

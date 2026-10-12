import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function pdfPreviewAssets() {
  const root = fileURLToPath(new URL('../node_modules/pdfjs-dist/', import.meta.url));
  const version = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  const assets = new Map();
  for (const directory of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
    for (const file of readdirSync(path.join(root, directory))) assets.set(`${directory}/${file}`, path.join(root, directory, file));
  }
  return {
    name: 'pdf-preview-assets',
    generateBundle() {
      for (const [name, file] of assets) this.emitFile({ type: 'asset', fileName: `pdfjs/${version}/${name}`, source: readFileSync(file) });
    },
    configureServer(server) {
      const prefix = `${server.config.base}pdfjs/${version}/`;
      server.middlewares.use((req, res, next) => {
        const url = String(req.url || '').split('?')[0];
        if (!url.startsWith(prefix)) return next();
        const name = url.slice(prefix.length);
        const file = assets.get(name);
        if (!file) { res.statusCode = 404; return res.end(); }
        const types = { '.wasm': 'application/wasm', '.js': 'text/javascript', '.ttf': 'font/ttf' };
        res.setHeader('Content-Type', types[path.extname(name)] || 'application/octet-stream');
        return res.end(readFileSync(file));
      });
    },
  };
}

import { build } from 'esbuild';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

const result = await build({
  entryPoints: ['dist/main.js'], outfile: 'dist/app.js', bundle: true,
  format: 'esm', platform: 'browser', target: ['es2020'], minify: true,
  legalComments: 'linked', metafile: true,
});
const bytes = await readFile('dist/app.js');
await mkdir('artifacts', { recursive: true });
await writeFile('artifacts/bundle-meta.json', JSON.stringify(result.metafile, null, 2));
console.log(`Startup: ${Object.keys(result.metafile.inputs).length} modules → 1 request; ${gzipSync(bytes).length} gzip bytes.`);

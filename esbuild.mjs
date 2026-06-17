//@ts-check
import * as esbuild from 'esbuild';
import { fileURLToPath } from 'url';
import path from 'path';

const dir = path.dirname(fileURLToPath(import.meta.url));

const ctx = await esbuild.context({
    entryPoints: [path.join(dir, 'src/index.ts')],
    outfile: path.join(dir, 'dist/index.js'),
    bundle: true,
    target: 'node20',
    format: 'esm',
    loader: { '.ts': 'ts' },
    platform: 'node',
    minify: true,
});

await ctx.rebuild();
ctx.dispose();

console.log('Build succeeded');

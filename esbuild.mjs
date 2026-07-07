//@ts-check
import * as esbuild from 'esbuild';
import { fileURLToPath } from 'url';
import path from 'path';

const dir = path.dirname(fileURLToPath(import.meta.url));

const ctx = await esbuild.context({
    entryPoints: [path.join(dir, 'src/index.ts')],
    outfile: path.join(dir, 'dist/index.cjs'),
    bundle: true,
    target: 'node24',
    format: 'cjs',
    loader: { '.ts': 'ts' },
    platform: 'node',
    minify: true
});

await ctx.rebuild();
await ctx.dispose();

console.log('Build succeeded');

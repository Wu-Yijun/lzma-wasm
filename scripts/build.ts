import { execSync } from 'node:child_process';
import fs from 'node:fs';
import esbuild from 'esbuild';

console.log("🚀 [1/4] Compiling Rust to WebAssembly...");
// Compile in release mode, targeting the web
execSync('wasm-pack build --target web --release', { stdio: 'inherit' });

console.log("📦 [2/4] Converting Wasm into an inline Base64 module...");
const wasmBuffer = fs.readFileSync('./pkg/lzma_wasm_bg.wasm');
const base64Str = wasmBuffer.toString('base64');
// Generate a dummy JS file for TypeScript imports
fs.writeFileSync('./lib/wasm-b64.ts', `export const WASM_BASE64: string = "${base64Str}";\n`);

console.log("🗜️  [3/4] Bundling CJS and ESM outputs using esbuild...");
// Bundle the ESM version
esbuild.buildSync({
    entryPoints: ['./lib/index.ts'],
    format: 'esm',
    outfile: './dist/esm/index.js',
    bundle: true,
    minify: true,
    external: ['node:buffer'] 
});

// Bundle the CJS version (Node.js specific)
esbuild.buildSync({
    entryPoints: ['./lib/index.ts'],
    format: 'cjs',
    outfile: './dist/cjs/index.cjs',
    bundle: true,
    minify: true,
    logOverride: { 'empty-import-meta': 'silent' }
});

// Bundle the IIFE version for use with legacy `<script>` tags (providing maximum backward compatibility)
esbuild.buildSync({
    entryPoints: ['./lib/index.ts'],
    format: 'iife',
    globalName: 'lzma_wasm', // Expose to `window.lzma_wasm`
    outfile: './dist/iife/index.js',
    bundle: true,
    minify: true,
    logOverride: { 'empty-import-meta': 'silent' },
    footer: { js: 'window.LzmaWasm = lzma_wasm;' }
});

console.log("📝 [4/4] Generating TypeScript declaration files (.d.ts)...");
// Invoke `tsc` to generate only the type declaration files
execSync('pnpm run tsc', { stdio: 'inherit' });

console.log("🧹 [5/5] Cleaning up unused internal type declarations...");
const internalDtsPath = './dist/wasm-b64.d.ts';
// If the file exists, delete it directly
if (fs.existsSync(internalDtsPath)) {
    fs.unlinkSync(internalDtsPath);
}

console.log("✅ Build complete! Outputs saved to the /dist directory.");


import { initWasm, compress, decompress } from 'lzma-wasm';

import pkg from './core.js';

pkg.run("ESM", initWasm, compress, decompress);
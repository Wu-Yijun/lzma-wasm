const { initWasm, compress, decompress } = require('lzma-wasm');

const pkg = require('./core.js');

pkg.run("CJS", initWasm, compress, decompress);
// 引入 wasm-pack 生成的原始胶水代码 (打包时 esbuild 会把它的内容内联进来)
import {default as init, decompress_to_buffer, decompress_dynamic } from '../pkg/lzma_wasm.js';
// 引入由构建脚本动态生成的 base64 字符串
import { WASM_BASE64 } from './wasm-b64.js';

let isReady = false;

const MEM_LIMIT = 1024 * 1024 * 256; // 默认 256MB 内存限制，防止恶意文件导致 OOM

/**
 * 初始化 Wasm 环境 (必须在使用其他 API 前调用)
 */
export async function initWasm(): Promise<void> {
  if (isReady) return;

  let wasmBytes: Uint8Array;

  // 跨环境 Base64 解码逻辑
  if (typeof Buffer !== 'undefined') {
    // Node.js 环境：极速解码
    wasmBytes = Buffer.from(WASM_BASE64, 'base64');
  } else {
    // 浏览器 / Deno 环境：原生 atob 解码
    const str = atob(WASM_BASE64);
    wasmBytes = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
      wasmBytes[i] = str.charCodeAt(i);
    }
  }

  // 将字节流喂给 wasm-bindgen 的 init 函数
  await init(wasmBytes);
  isReady = true;
}

export interface DecompressOptions {
  /** 预期输出大小，提供此项启用 Zero-Allocation 极致性能模式 */
  expectedSize?: number;
  /** 内存限制(字节)，防止恶意文件导致 OOM */
  memLimit?: number;
}

/**
 * 通用解压接口
 */
export function decompress(compressed: Uint8Array, options?: DecompressOptions): Uint8Array {
  if (!isReady) throw new Error("请先调用并等待 initWasm() 完成初始化");

  if (options?.expectedSize) {
    // 走预分配内存的高性能路线
    const outBuffer = new Uint8Array(options.expectedSize);
    const bytesWritten = decompress_to_buffer(compressed, outBuffer, options.memLimit ?? MEM_LIMIT);
    // 如果文件实际没那么大，截断未使用的部分
    return outBuffer.subarray(0, bytesWritten);
  } else {
    // 走 Rust 动态扩容路线
    const memLimit = options?.memLimit ?? MEM_LIMIT; // 默认 256MB 限制
    return decompress_dynamic(compressed, memLimit);
  }
}

export function decompressToBuffer(compressed: Uint8Array, outBuffer: Uint8Array, memLimit?: number): number {
  if (!isReady) throw new Error("请先调用并等待 initWasm() 完成初始化");
  return decompress_to_buffer(compressed, outBuffer, memLimit ?? MEM_LIMIT);
}
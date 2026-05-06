import { beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import { compress, decompress, initWasm } from "../lib/index.ts"; // 根据实际路径调整

// --- 辅助函数：调用系统原生命令行工具 ---

function checkSystemCommand(cmd: string): boolean {
  const res = spawnSync(cmd, ["--version"]);
  return res.status === 0;
}

/** 使用原生命令行压缩 */
function nativeCompress(
  data: Uint8Array,
  format: "xz" | "lzma" | "lzip",
): Uint8Array {
  let cmd = "";
  let args: string[] = [];

  if (format === "xz") {
    cmd = "xz";
    args = ["-z", "-c", "--format=xz"];
  } else if (format === "lzma") {
    cmd = "xz";
    args = ["-z", "-c", "--format=lzma"];
  } else if (format === "lzip") {
    cmd = "lzip";
    args = ["-c"];
  }

  const result = spawnSync(cmd, args, {
    input: data,
    maxBuffer: 1024 * 1024 * 512,
  }); // 增加 maxBuffer 以处理较大数据
  if (result.status !== 0) {
    throw new Error(`${cmd} 压缩失败: ${result.stderr.toString()}`);
  }
  return result.stdout;
}

/** 使用原生命令行解压 */
function nativeDecompress(
  data: Uint8Array,
  format: "xz" | "lzma" | "lzip",
): Uint8Array {
  let cmd = "";
  let args: string[] = [];

  if (format === "xz" || format === "lzma") {
    cmd = "xz";
    args = ["-d", "-c"];
  } else if (format === "lzip") {
    cmd = "lzip";
    args = ["-d", "-c"];
  }

  const result = spawnSync(cmd, args, {
    input: data,
    maxBuffer: 1024 * 1024 * 512,
  }); // 增加 maxBuffer 以处理较大数据l
  if (result.status !== 0) {
    throw new Error(`${cmd} 解压失败: ${result.stderr.toString()}`);
  }
  return result.stdout;
}

// --- 测试主体 ---

describe("互操作性交叉验证 (Interoperability)", () => {
  // 检查本机是否安装了对应的 CLI 工具
  const hasXz = checkSystemCommand("xz");
  const hasLzip = checkSystemCommand("lzip");

  beforeAll(async () => {
    await initWasm();
    if (!hasXz) console.warn("⚠️ 未检测到 xz 命令行，部分测试将被跳过");
    if (!hasLzip) console.warn("⚠️ 未检测到 lzip 命令行，部分测试将被跳过");
  });

  // 准备测试数据矩阵
  const testCases = [
    { name: "极短随机数据 (10 Bytes)", data: crypto.randomBytes(10) },
    { name: "极短随机数据2 (7 Bytes)", data: crypto.randomBytes(7) },
    { name: "中等随机数据 (50 KB)", data: crypto.randomBytes(50 * 1024) },
    {
      name: "较长随机数据 (10 MB)",
      data: crypto.randomBytes(10 * 1024 * 1024),
    },
    { name: "高压缩率数据 (全零 500 KB)", data: Buffer.alloc(500 * 1024, 0) },
  ];

  const formats: ("xz" | "lzma" | "lzip")[] = ["xz", "lzma", "lzip"];

  for (const format of formats) {
    describe(`格式: ${format.toUpperCase()}`, () => {
      // 如果系统没有对应的命令，则跳过该格式的原生测试
      const shouldSkip = (format === "lzip" && !hasLzip) ||
        (format !== "lzip" && !hasXz);

      for (const { name, data } of testCases) {
        it(`[${name}] Wasm 内部闭环验证 (Wasm 压 -> Wasm 解)`, () => {
          const comp = compress(data, { format, level: 3 }); // 使用低级别加快测试
          const decomp = decompress(comp);
          // Buffer.compare 或者 deepEqual
          expect(Buffer.from(decomp).equals(Buffer.from(data))).toBe(true);
        });

        it.skipIf(shouldSkip)(`[${name}] 原生压缩 -> Wasm 解压`, () => {
          // 1. 使用 C/C++ 标准工具压缩
          const nativeCompressed = nativeCompress(data, format);
          // 2. 使用我们的库解压
          const decomp = decompress(nativeCompressed);
          // 3. 验证无损
          expect(Buffer.from(decomp).equals(Buffer.from(data))).toBe(true);
        });

        it.skipIf(shouldSkip)(`[${name}] Wasm 压缩 -> 原生解压`, () => {
          // 1. 使用我们的库压缩
          const wasmCompressed = compress(data, { format, level: 3 });
          // 2. 使用 C/C++ 标准工具解压
          const nativeDecomp = nativeDecompress(wasmCompressed, format);
          // 3. 验证无损
          expect(Buffer.from(nativeDecomp).equals(Buffer.from(data))).toBe(
            true,
          );
        });
      }
    });
  }
});

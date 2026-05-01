use lzma_rust2::LzmaReader;
use std::io::Read;
use wasm_bindgen::prelude::*;

/// 解码 LZMA 数据到外部提供的 buffer 中
///
/// * `compressed`: 压缩的 LZMA 数据
/// * `out_buffer`: JS 侧传入的预分配好长度的 Uint8Array
///
/// 返回实际写入的字节数。
#[wasm_bindgen]
pub fn decode_lzma_to_buffer(compressed: &[u8], out_buffer: &mut [u8]) -> Result<usize, JsValue> {
    // 初始化 LzmaReader，设置内存限制防 OOM
    let mut reader = LzmaReader::new_mem_limit(compressed, u32::MAX, None)
        .map_err(|e| JsValue::from_str(&format!("初始化 LzmaReader 失败: {}", e)))?;

    let mut total_read = 0;
    let out_len = out_buffer.len();

    // 循环读取数据填充到 out_buffer 中
    loop {
        // 防止解压后的数据大于预期，导致 slice 越界 panic
        if total_read >= out_len {
            break;
        }

        // 每次只向剩余的切片空间写入
        let n = reader
            .read(&mut out_buffer[total_read..])
            .map_err(|e| JsValue::from_str(&format!("解压读取失败: {}", e)))?;

        // n == 0 表示解压完毕（EOF）
        if n == 0 {
            break;
        }

        total_read += n;
    }

    // 可选：如果希望严格校验长度是否完全一致，可以在此处增加判断逻辑
    // if total_read != out_len { ... }

    Ok(total_read)
}

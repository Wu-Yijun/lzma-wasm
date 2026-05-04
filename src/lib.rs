use lzma_rust2::{LzipReader, LzmaOptions, LzmaReader, LzmaWriter, XzReader};
use std::io::{Read, Write};
use wasm_bindgen::prelude::*;

enum AutoReader<'a> {
    Lzma(LzmaReader<&'a [u8]>),
    Xz(XzReader<&'a [u8]>),
    Lzip(LzipReader<&'a [u8]>),
}

impl<'a> Read for AutoReader<'a> {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        match self {
            AutoReader::Lzma(r) => r.read(buf),
            AutoReader::Xz(r) => r.read(buf),
            AutoReader::Lzip(r) => r.read(buf),
        }
    }
}

fn detect_decompress_reader(compressed: &[u8], mem_limit: u32) -> Result<AutoReader<'_>, JsValue> {
    if compressed.len() < 6 {
        return Err(JsValue::from_str("输入的数据太短，无法识别格式"));
    }
    if compressed.starts_with(&[0xFD, 0x37, 0x7A, 0x58, 0x5A, 0x00]) {
        let r = XzReader::new(compressed, true);
        // .map_err(|e| JsValue::from_str(&format!("初始化 XzReader 失败: {}", e)))?;
        Ok(AutoReader::Xz(r))
    } else if compressed.starts_with(&[0x4C, 0x5A, 0x49, 0x50]) {
        let r = LzipReader::new(compressed);
        // .map_err(|e| JsValue::from_str(&format!("初始化 LzipReader 失败: {}", e)))?;
        Ok(AutoReader::Lzip(r))
    } else {
        let r = LzmaReader::new_mem_limit(compressed, mem_limit, None)
            .map_err(|e| JsValue::from_str(&format!("初始化 LzmaReader 失败: {}", e)))?;
        Ok(AutoReader::Lzma(r))
    }
}

#[wasm_bindgen]
pub fn decompress_to_buffer(compressed: &[u8], out_buffer: &mut [u8], mem_limit: u32) -> Result<usize, JsValue> {
    let mut reader = detect_decompress_reader(compressed, mem_limit)?;

    let mut total_read = 0;
    let out_len = out_buffer.len();

    loop {
        if total_read >= out_len {
            break;
        }

        let n = reader
            .read(&mut out_buffer[total_read..])
            .map_err(|e| JsValue::from_str(&format!("解压读取失败: {}", e)))?;

        if n == 0 {
            break;
        }
        total_read += n;
    }

    Ok(total_read)
}

// 给普通用户用的，返回 Vec<u8>，Rust 自己管理扩容
#[wasm_bindgen]
pub fn decompress_dynamic(compressed: &[u8], mem_limit: u32) -> Result<Vec<u8>, JsValue> {
    let mut reader = detect_decompress_reader(compressed, mem_limit)?;

    let mut decompressed = Vec::new();
    // 使用 read_to_end 自动扩容
    reader
        .read_to_end(&mut decompressed)
        .map_err(|e| JsValue::from_str(&format!("解压失败: {}", e)))?;

    Ok(decompressed)
}

#[wasm_bindgen]
pub fn encode_lzma_from_buffer(input: &[u8]) -> Result<Vec<u8>, JsValue> {
    let mut writer = LzmaWriter::new_use_header(
        Vec::new(),
        &LzmaOptions::default(),
        Some(input.len() as u64),
    )
    .unwrap();
    writer.write_all(input).unwrap();
    let res = writer.finish().unwrap();
    Ok(res)
}

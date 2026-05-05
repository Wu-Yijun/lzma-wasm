use lzma_rust2::{
    LzipOptions, LzipReader, LzipWriter, LzmaOptions, LzmaReader, LzmaWriter, XzOptions, XzReader,
    XzWriter,
};
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
        return Err(JsValue::from_str("Input data is too short to identify the format"));
    }
    if compressed.starts_with(&[0xFD, 0x37, 0x7A, 0x58, 0x5A, 0x00]) {
        let r = XzReader::new(compressed, true);
        Ok(AutoReader::Xz(r))
    } else if compressed.starts_with(&[0x4C, 0x5A, 0x49, 0x50]) {
        let r = LzipReader::new(compressed);
        Ok(AutoReader::Lzip(r))
    } else {
        let r = LzmaReader::new_mem_limit(compressed, mem_limit, None)
            .map_err(|e| JsValue::from_str(&format!("Decompression read failed: {}", e)))?;
        Ok(AutoReader::Lzma(r))
    }
}

#[wasm_bindgen]
pub fn decompress_to_buffer(
    compressed: &[u8],
    out_buffer: &mut [u8],
    mem_limit: u32,
) -> Result<usize, JsValue> {
    let mut reader = detect_decompress_reader(compressed, mem_limit)?;

    let mut total_read = 0;
    let out_len = out_buffer.len();

    loop {
        if total_read >= out_len {
            break;
        }

        let n = reader
            .read(&mut out_buffer[total_read..])
            .map_err(|e| JsValue::from_str(&format!("Decompression read failed: {}", e)))?;

        if n == 0 {
            break;
        }
        total_read += n;
    }

    Ok(total_read)
}

// Intended for general users; returns a Vec<u8>, with Rust handling capacity expansion automatically.
#[wasm_bindgen]
pub fn decompress_dynamic(compressed: &[u8], mem_limit: u32) -> Result<Vec<u8>, JsValue> {
    let mut reader = detect_decompress_reader(compressed, mem_limit)?;

    let mut decompressed = Vec::new();
    // Uses `read_to_end` for automatic resizing.
    reader
        .read_to_end(&mut decompressed)
        .map_err(|e| JsValue::from_str(&format!("Decompression failed: {}", e)))?;

    Ok(decompressed)
}


#[wasm_bindgen]
pub fn compress_lzma(input: &[u8], level: u32) -> Result<Vec<u8>, JsValue> {
    let mut options = LzmaOptions::default();
    options.set_preset(level); // Leverages the library's built-in level analysis capabilities.

    let mut writer = LzmaWriter::new_use_header(Vec::new(), &options, Some(input.len() as u64))
        .map_err(|e| JsValue::from_str(&format!("Failed to initialize LzmaWriter: {}", e)))?;

    writer
        .write_all(input)
        .map_err(|e| JsValue::from_str(&format!("Write failed: {}", e)))?;
    writer
        .finish()
        .map_err(|e| JsValue::from_str(&format!("Finalization failed: {}", e)))
}

#[wasm_bindgen]
pub fn compress_xz(input: &[u8], level: u32) -> Result<Vec<u8>, JsValue> {
    // Options specific to the modern XZ format.
    let mut options = XzOptions::default();
    options.lzma_options.set_preset(level);

    let mut writer = XzWriter::new(Vec::new(), options)
        .map_err(|e| JsValue::from_str(&format!("Failed to initialize LzmaXzWriter: {}", e)))?;

    writer
        .write_all(input)
        .map_err(|e| JsValue::from_str(&format!("XZ write failed: {}", e)))?;
    writer
        .finish()
        .map_err(|e| JsValue::from_str(&format!("XZ finalization failed: {}", e)))
}

#[wasm_bindgen]
pub fn compress_lzip(input: &[u8], level: u32) -> Result<Vec<u8>, JsValue> {
    // Options specific to the LZIP format.
    let mut options = LzipOptions::default();
    options.lzma_options.set_preset(level);

    let mut writer = LzipWriter::new(Vec::new(), options);

    writer
        .write_all(input)
        .map_err(|e| JsValue::from_str(&format!("LZIP write failed: {}", e)))?;
    writer
        .finish()
        .map_err(|e| JsValue::from_str(&format!("LZIP finalization failed: {}", e)))
}

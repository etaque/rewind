//! Streaming GRIB2 parser for extracting wind data from chunked HTTP responses.
//!
//! Ported from https://github.com/etaque/gfs-wind-downloader

use bytes::{Buf, BytesMut};
use std::io::Cursor;

/// Streaming GRIB2 parser that extracts complete messages from chunked data.
///
/// GRIB2 files contain multiple messages, each starting with "GRIB" magic bytes
/// and ending with "7777". This parser accumulates incoming data chunks and
/// extracts complete messages as they become available.
pub struct Grib2StreamParser {
    buffer: BytesMut,
}

impl Grib2StreamParser {
    /// Create a new parser with a 64KB initial buffer capacity.
    pub fn new() -> Self {
        Self {
            buffer: BytesMut::with_capacity(64 * 1024),
        }
    }

    /// Feed data into the parser and extract any complete GRIB2 messages.
    ///
    /// Returns a vector of complete messages. Each message is a self-contained
    /// GRIB2 record that can be parsed independently.
    pub fn feed(&mut self, data: &[u8]) -> Vec<Vec<u8>> {
        self.buffer.extend_from_slice(data);
        let mut messages = Vec::new();
        while let Some(msg) = self.try_extract_message() {
            messages.push(msg);
        }
        messages
    }

    /// Try to extract a complete GRIB2 message from the buffer.
    ///
    /// GRIB2 message structure:
    /// - Bytes 0-3: "GRIB" magic bytes
    /// - Bytes 4-7: Reserved
    /// - Bytes 8-15: Total message length (big-endian u64)
    /// - ...message content...
    /// - Last 4 bytes: "7777" end marker
    fn try_extract_message(&mut self) -> Option<Vec<u8>> {
        // Find the start of a GRIB message
        let pos = self.buffer.windows(4).position(|w| w == b"GRIB")?;

        // Skip any garbage before the GRIB marker
        if pos > 0 {
            self.buffer.advance(pos);
        }

        // Need at least 16 bytes to read the header
        if self.buffer.len() < 16 {
            return None;
        }

        // Read message length from bytes 8-15 (big-endian u64)
        let len_bytes: [u8; 8] = self.buffer[8..16].try_into().ok()?;
        let msg_len = u64::from_be_bytes(len_bytes) as usize;

        // Sanity check: reject unreasonably large messages (>1GB)
        if msg_len > 1_000_000_000 {
            // Skip past the "GRIB" marker and try again
            self.buffer.advance(4);
            return None;
        }

        // Wait for the complete message
        if self.buffer.len() < msg_len {
            return None;
        }

        // Extract the message
        let msg = self.buffer.split_to(msg_len).to_vec();

        // Validate the end marker
        if msg.len() < 4 || &msg[msg.len() - 4..] != b"7777" {
            return None;
        }

        Some(msg)
    }
}

impl Default for Grib2StreamParser {
    fn default() -> Self {
        Self::new()
    }
}

/// Check if a GRIB2 message contains wind data (U or V component).
///
/// Wind components are identified by:
/// - Discipline 0: Meteorological products
/// - Parameter Category 2: Momentum
/// - Parameter Number 2: U-component of wind (UGRD)
/// - Parameter Number 3: V-component of wind (VGRD)
pub fn is_wind_message(msg: &[u8]) -> bool {
    let Ok(grib2) = grib::from_reader(Cursor::new(msg)) else {
        return false;
    };

    for (_, submsg) in grib2.iter() {
        let prod_def = submsg.prod_def();
        let Some(cat) = prod_def.parameter_category() else {
            continue;
        };
        let Some(num) = prod_def.parameter_number() else {
            continue;
        };
        // Category 2 = Momentum, Parameter 2 = UGRD, Parameter 3 = VGRD
        if cat == 2 && (num == 2 || num == 3) {
            return true;
        }
    }

    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parser_creation() {
        let parser = Grib2StreamParser::new();
        assert_eq!(parser.buffer.len(), 0);
    }

    #[test]
    fn test_feed_incomplete_data() {
        let mut parser = Grib2StreamParser::new();
        // Feed partial GRIB header
        let messages = parser.feed(b"GRIB");
        assert!(messages.is_empty());
    }

    #[test]
    fn test_feed_garbage_before_grib() {
        let mut parser = Grib2StreamParser::new();
        // Feed some garbage followed by incomplete GRIB
        let messages = parser.feed(b"garbage_dataGRIB");
        assert!(messages.is_empty());
        // Buffer should have advanced past garbage
        assert!(parser.buffer.starts_with(b"GRIB"));
    }
}

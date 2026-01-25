//! S3 multipart upload helper for streaming large files.
//!
//! Uses object_store's multipart upload API to efficiently upload
//! data in chunks without buffering the entire file in memory.

use anyhow::{Context, Result};
use object_store::aws::AmazonS3;
use object_store::path::Path;
use object_store::{MultipartUpload, ObjectStoreExt, PutPayload};

/// Minimum part size for S3 multipart uploads (5 MB).
const MIN_PART_SIZE: usize = 5 * 1024 * 1024;

/// Buffer capacity (10 MB).
const BUFFER_CAPACITY: usize = 10 * 1024 * 1024;

/// S3 multipart uploader that buffers data and uploads in chunks.
///
/// Data is buffered until it reaches `MIN_PART_SIZE`, then uploaded as a part.
/// Call `complete()` to finalize the upload, or `abort()` to cancel it.
pub struct S3MultipartUploader {
    upload: Box<dyn MultipartUpload>,
    buffer: Vec<u8>,
    key: String,
}

impl S3MultipartUploader {
    /// Create a new multipart upload for the given key.
    pub async fn new(client: &AmazonS3, key: &str) -> Result<Self> {
        let path = Path::from(key);
        let upload = client
            .put_multipart(&path)
            .await
            .context("Failed to initiate multipart upload")?;

        Ok(Self {
            upload,
            buffer: Vec::with_capacity(BUFFER_CAPACITY),
            key: key.to_string(),
        })
    }

    /// Write data to the upload buffer.
    ///
    /// When the buffer reaches `MIN_PART_SIZE`, it is automatically
    /// flushed as a part upload.
    pub async fn write(&mut self, data: &[u8]) -> Result<()> {
        self.buffer.extend_from_slice(data);

        // Flush when buffer exceeds minimum part size
        while self.buffer.len() >= MIN_PART_SIZE {
            self.flush_part().await?;
        }

        Ok(())
    }

    /// Flush the current buffer as a part upload.
    async fn flush_part(&mut self) -> Result<()> {
        if self.buffer.is_empty() {
            return Ok(());
        }

        // Take up to MIN_PART_SIZE bytes from the buffer
        let part_size = self.buffer.len().min(MIN_PART_SIZE);
        let part_data: Vec<u8> = self.buffer.drain(..part_size).collect();

        self.upload
            .put_part(PutPayload::from(part_data))
            .await
            .context("Failed to upload part")?;

        Ok(())
    }

    /// Complete the multipart upload.
    ///
    /// Flushes any remaining buffered data and finalizes the upload.
    /// S3 requires at least one part, so an empty part is uploaded if needed.
    pub async fn complete(mut self) -> Result<()> {
        // Flush any remaining data
        if !self.buffer.is_empty() {
            let remaining = std::mem::take(&mut self.buffer);
            self.upload
                .put_part(PutPayload::from(remaining))
                .await
                .context("Failed to upload final part")?;
        }

        self.upload
            .complete()
            .await
            .context("Failed to complete multipart upload")?;

        Ok(())
    }

    /// Abort the multipart upload.
    ///
    /// Cancels the upload and cleans up any uploaded parts.
    pub async fn abort(mut self) -> Result<()> {
        self.upload
            .abort()
            .await
            .context("Failed to abort multipart upload")?;

        log::warn!("Aborted multipart upload: {}", self.key);
        Ok(())
    }
}

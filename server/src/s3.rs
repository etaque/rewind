use std::sync::LazyLock;

use crate::config::config;
use object_store::aws;

fn client_for_bucket(bucket: &str) -> aws::AmazonS3 {
    let s3 = &config().s3;
    aws::AmazonS3Builder::new()
        .with_region(&s3.region)
        .with_endpoint(&s3.endpoint)
        .with_bucket_name(bucket)
        .with_access_key_id(&s3.access_key)
        .with_secret_access_key(&s3.secret_key)
        .with_allow_http(true)
        // Use path-style URLs (http://localhost:9000/bucket/key) instead of
        // virtual-hosted style (http://bucket.localhost:9000/key) for MinIO
        .with_virtual_hosted_style_request(false)
        .build()
        .unwrap()
}

static GRIB_CLIENT: LazyLock<aws::AmazonS3> =
    LazyLock::new(|| client_for_bucket(&config().s3.grib_bucket));

static RASTER_CLIENT: LazyLock<aws::AmazonS3> =
    LazyLock::new(|| client_for_bucket(&config().s3.raster_bucket));

static PATHS_CLIENT: LazyLock<aws::AmazonS3> =
    LazyLock::new(|| client_for_bucket(&config().s3.paths_bucket));

pub fn grib_client() -> &'static aws::AmazonS3 {
    &GRIB_CLIENT
}

pub fn raster_client() -> &'static aws::AmazonS3 {
    &RASTER_CLIENT
}

pub fn paths_client() -> &'static aws::AmazonS3 {
    &PATHS_CLIENT
}

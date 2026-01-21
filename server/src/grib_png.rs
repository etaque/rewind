use anyhow::{Result, anyhow};
use bytes::Bytes;
use grib::Grib2SubmessageDecoder;
use png::{BitDepth, ColorType, Encoder};
use std::io::Cursor;

// Wind component parameters in GRIB2:
// Discipline 0 (Meteorological), Category 2 (Momentum)
// Parameter 2 = U-component, Parameter 3 = V-component
const DISCIPLINE_METEOROLOGICAL: u8 = 0;
const CATEGORY_MOMENTUM: u8 = 2;
const PARAM_U_WIND: u8 = 2;
const PARAM_V_WIND: u8 = 3;

// Output PNG dimensions for 0.5° resolution (VLM source)
const WIDTH_05: usize = 720;
const HEIGHT_05: usize = 360;
const HEIGHT_05_WITH_POLES: usize = 361;

// Output PNG dimensions for 0.25° resolution (NCAR source)
const WIDTH_025: usize = 1440;
const HEIGHT_025: usize = 720;
const HEIGHT_025_WITH_POLES: usize = 721;

// Wind speed range for normalization (m/s)
const WIND_MIN: f32 = -30.0;
const WIND_MAX: f32 = 30.0;

/// Convert a GRIB2 file containing U and V wind components to a PNG.
/// The PNG has R=U, G=V, B=0 where values are mapped from -30..30 m/s to 0..255.
pub fn grib_to_uv_png(grib_data: &[u8]) -> Result<Bytes> {
    let cursor = Cursor::new(grib_data);
    let grib2 = grib::from_reader(cursor)?;

    let mut u_values: Option<Vec<f32>> = None;
    let mut v_values: Option<Vec<f32>> = None;

    // Iterate through submessages to find U and V components
    for (_index, submessage) in grib2.iter() {
        let prod_def = submessage.prod_def();

        // Check discipline (should be 0 for meteorological)
        let discipline = submessage.indicator().discipline;
        if discipline != DISCIPLINE_METEOROLOGICAL {
            continue;
        }

        // Get category and parameter from product definition
        let category = match prod_def.parameter_category() {
            Some(cat) => cat,
            None => continue,
        };
        let parameter = match prod_def.parameter_number() {
            Some(param) => param,
            None => continue,
        };

        if category != CATEGORY_MOMENTUM {
            continue;
        }

        // Decode the values
        let decoder = Grib2SubmessageDecoder::from(submessage)?;
        let values: Vec<f32> = decoder.dispatch()?.collect();

        match parameter {
            PARAM_U_WIND => u_values = Some(values),
            PARAM_V_WIND => v_values = Some(values),
            _ => continue,
        }

        // Stop if we have both components
        if u_values.is_some() && v_values.is_some() {
            break;
        }
    }

    let u = u_values.ok_or_else(|| anyhow!("U-component wind not found in GRIB"))?;
    let v = v_values.ok_or_else(|| anyhow!("V-component wind not found in GRIB"))?;

    // Detect resolution from grid size and normalize
    let (u, v, width, height) = detect_and_normalize_grid(u, v)?;

    // Create RGB image data (R=U, G=V, B=0)
    let mut rgb_data = vec![0u8; width * height * 3];

    for i in 0..(width * height) {
        let u_normalized = normalize_wind(u[i]);
        let v_normalized = normalize_wind(v[i]);

        rgb_data[i * 3] = u_normalized;
        rgb_data[i * 3 + 1] = v_normalized;
        rgb_data[i * 3 + 2] = 0;
    }

    // Encode as PNG
    encode_png(&rgb_data, width, height)
}

/// Detect grid resolution and normalize to standard dimensions.
/// Returns (u_values, v_values, width, height).
fn detect_and_normalize_grid(
    u: Vec<f32>,
    v: Vec<f32>,
) -> Result<(Vec<f32>, Vec<f32>, usize, usize)> {
    let len = u.len();

    // 0.25° resolution (1440×720 or 1440×721)
    if len == WIDTH_025 * HEIGHT_025_WITH_POLES && v.len() == WIDTH_025 * HEIGHT_025_WITH_POLES {
        // Skip the last row (south pole) to get 720 rows
        Ok((
            u[..WIDTH_025 * HEIGHT_025].to_vec(),
            v[..WIDTH_025 * HEIGHT_025].to_vec(),
            WIDTH_025,
            HEIGHT_025,
        ))
    } else if len == WIDTH_025 * HEIGHT_025 && v.len() == WIDTH_025 * HEIGHT_025 {
        Ok((u, v, WIDTH_025, HEIGHT_025))
    }
    // 0.5° resolution (720×360 or 720×361)
    else if len == WIDTH_05 * HEIGHT_05_WITH_POLES && v.len() == WIDTH_05 * HEIGHT_05_WITH_POLES {
        // Skip the last row (south pole) to get 360 rows
        Ok((
            u[..WIDTH_05 * HEIGHT_05].to_vec(),
            v[..WIDTH_05 * HEIGHT_05].to_vec(),
            WIDTH_05,
            HEIGHT_05,
        ))
    } else if len == WIDTH_05 * HEIGHT_05 && v.len() == WIDTH_05 * HEIGHT_05 {
        Ok((u, v, WIDTH_05, HEIGHT_05))
    } else {
        Err(anyhow!(
            "Unexpected grid size: U={}, V={}. Expected 0.5° ({} or {}) or 0.25° ({} or {})",
            u.len(),
            v.len(),
            WIDTH_05 * HEIGHT_05,
            WIDTH_05 * HEIGHT_05_WITH_POLES,
            WIDTH_025 * HEIGHT_025,
            WIDTH_025 * HEIGHT_025_WITH_POLES
        ))
    }
}

/// Normalize wind speed from -30..30 m/s to 0..255
fn normalize_wind(value: f32) -> u8 {
    let clamped = value.clamp(WIND_MIN, WIND_MAX);
    let normalized = (clamped - WIND_MIN) / (WIND_MAX - WIND_MIN);
    (normalized * 255.0).round() as u8
}

/// Encode RGB data as PNG
fn encode_png(rgb_data: &[u8], width: usize, height: usize) -> Result<Bytes> {
    let mut buffer = Vec::new();
    {
        let mut encoder = Encoder::new(&mut buffer, width as u32, height as u32);
        encoder.set_color(ColorType::Rgb);
        encoder.set_depth(BitDepth::Eight);

        let mut writer = encoder.write_header()?;
        writer.write_image_data(rgb_data)?;
    }

    Ok(Bytes::from(buffer))
}

#[cfg(test)]
mod tests {
    use super::*;

    // =========================================================================
    // normalize_wind tests
    // =========================================================================

    #[test]
    fn test_normalize_wind_boundaries() {
        assert_eq!(normalize_wind(-30.0), 0);
        assert_eq!(normalize_wind(30.0), 255);
    }

    #[test]
    fn test_normalize_wind_zero() {
        // 0 m/s should map to middle of range: (0 - (-30)) / 60 * 255 = 127.5 → 128
        assert_eq!(normalize_wind(0.0), 128);
    }

    #[test]
    fn test_normalize_wind_clamping() {
        // Values outside -30..30 should be clamped
        assert_eq!(normalize_wind(-50.0), 0);
        assert_eq!(normalize_wind(-100.0), 0);
        assert_eq!(normalize_wind(50.0), 255);
        assert_eq!(normalize_wind(100.0), 255);
    }

    #[test]
    fn test_normalize_wind_negative_values() {
        // -15 m/s: (-15 - (-30)) / 60 * 255 = 15/60 * 255 = 63.75 → 64
        assert_eq!(normalize_wind(-15.0), 64);
    }

    #[test]
    fn test_normalize_wind_positive_values() {
        // 15 m/s: (15 - (-30)) / 60 * 255 = 45/60 * 255 = 191.25 → 191
        assert_eq!(normalize_wind(15.0), 191);
    }

    #[test]
    fn test_normalize_wind_typical_sailing_speeds() {
        // Light wind: 5 m/s (~10 knots)
        let light = normalize_wind(5.0);
        assert!(light > 128 && light < 180);

        // Moderate wind: 10 m/s (~20 knots)
        let moderate = normalize_wind(10.0);
        assert!(moderate > 150 && moderate < 200);

        // Strong wind: 20 m/s (~40 knots)
        let strong = normalize_wind(20.0);
        assert!(strong > 200 && strong < 255);
    }

    #[test]
    fn test_normalize_wind_nan_handling() {
        // NaN.clamp returns NaN, and (NaN * 255.0).round() as u8 = 0
        // Just verify it doesn't panic - the result is a valid u8 by type definition
        let _result = normalize_wind(f32::NAN);
    }

    #[test]
    fn test_normalize_wind_infinity() {
        // Positive infinity should clamp to max
        assert_eq!(normalize_wind(f32::INFINITY), 255);
        // Negative infinity should clamp to min
        assert_eq!(normalize_wind(f32::NEG_INFINITY), 0);
    }

    // =========================================================================
    // PNG encoding tests
    // =========================================================================

    #[test]
    fn test_encode_png_05_resolution() {
        let rgb_data = vec![0u8; WIDTH_05 * HEIGHT_05 * 3];
        let result = encode_png(&rgb_data, WIDTH_05, HEIGHT_05);
        assert!(result.is_ok());

        let png_bytes = result.unwrap();
        // PNG magic number check
        assert_eq!(&png_bytes[0..8], &[137, 80, 78, 71, 13, 10, 26, 10]);
    }

    #[test]
    fn test_encode_png_025_resolution() {
        let rgb_data = vec![0u8; WIDTH_025 * HEIGHT_025 * 3];
        let result = encode_png(&rgb_data, WIDTH_025, HEIGHT_025);
        assert!(result.is_ok());

        let png_bytes = result.unwrap();
        // PNG magic number check
        assert_eq!(&png_bytes[0..8], &[137, 80, 78, 71, 13, 10, 26, 10]);
    }

    #[test]
    fn test_encode_png_small_image() {
        let rgb_data = vec![255u8; 10 * 10 * 3]; // White 10x10 image
        let result = encode_png(&rgb_data, 10, 10);
        assert!(result.is_ok());
    }

    // =========================================================================
    // Grid detection tests
    // =========================================================================

    #[test]
    fn test_detect_grid_05_resolution() {
        let u = vec![0.0f32; WIDTH_05 * HEIGHT_05];
        let v = vec![0.0f32; WIDTH_05 * HEIGHT_05];
        let result = detect_and_normalize_grid(u, v);
        assert!(result.is_ok());
        let (_, _, width, height) = result.unwrap();
        assert_eq!(width, WIDTH_05);
        assert_eq!(height, HEIGHT_05);
    }

    #[test]
    fn test_detect_grid_05_with_poles() {
        let u = vec![0.0f32; WIDTH_05 * HEIGHT_05_WITH_POLES];
        let v = vec![0.0f32; WIDTH_05 * HEIGHT_05_WITH_POLES];
        let result = detect_and_normalize_grid(u, v);
        assert!(result.is_ok());
        let (u_out, v_out, width, height) = result.unwrap();
        assert_eq!(width, WIDTH_05);
        assert_eq!(height, HEIGHT_05);
        assert_eq!(u_out.len(), WIDTH_05 * HEIGHT_05);
        assert_eq!(v_out.len(), WIDTH_05 * HEIGHT_05);
    }

    #[test]
    fn test_detect_grid_025_resolution() {
        let u = vec![0.0f32; WIDTH_025 * HEIGHT_025];
        let v = vec![0.0f32; WIDTH_025 * HEIGHT_025];
        let result = detect_and_normalize_grid(u, v);
        assert!(result.is_ok());
        let (_, _, width, height) = result.unwrap();
        assert_eq!(width, WIDTH_025);
        assert_eq!(height, HEIGHT_025);
    }

    #[test]
    fn test_detect_grid_025_with_poles() {
        let u = vec![0.0f32; WIDTH_025 * HEIGHT_025_WITH_POLES];
        let v = vec![0.0f32; WIDTH_025 * HEIGHT_025_WITH_POLES];
        let result = detect_and_normalize_grid(u, v);
        assert!(result.is_ok());
        let (u_out, v_out, width, height) = result.unwrap();
        assert_eq!(width, WIDTH_025);
        assert_eq!(height, HEIGHT_025);
        assert_eq!(u_out.len(), WIDTH_025 * HEIGHT_025);
        assert_eq!(v_out.len(), WIDTH_025 * HEIGHT_025);
    }

    #[test]
    fn test_detect_grid_invalid_size() {
        let u = vec![0.0f32; 100];
        let v = vec![0.0f32; 100];
        let result = detect_and_normalize_grid(u, v);
        assert!(result.is_err());
    }
}

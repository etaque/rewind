use anyhow::{anyhow, Result};
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

// Output PNG dimensions (0.5 degree resolution)
const WIDTH: usize = 720;
const HEIGHT: usize = 360;

// Some GRIB files include both poles (-90 to +90 inclusive = 361 rows)
const HEIGHT_WITH_POLES: usize = 361;

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

    // Handle both 720×360 and 720×361 grids
    let (u, v) = if u.len() == WIDTH * HEIGHT_WITH_POLES && v.len() == WIDTH * HEIGHT_WITH_POLES {
        // Skip the last row (south pole at -90°) to get 360 rows
        (u[..WIDTH * HEIGHT].to_vec(), v[..WIDTH * HEIGHT].to_vec())
    } else if u.len() == WIDTH * HEIGHT && v.len() == WIDTH * HEIGHT {
        (u, v)
    } else {
        return Err(anyhow!(
            "Unexpected grid size: U={}, V={}, expected {} or {}",
            u.len(),
            v.len(),
            WIDTH * HEIGHT,
            WIDTH * HEIGHT_WITH_POLES
        ));
    };

    // Create RGB image data (R=U, G=V, B=0)
    let mut rgb_data = vec![0u8; WIDTH * HEIGHT * 3];

    for i in 0..(WIDTH * HEIGHT) {
        let u_normalized = normalize_wind(u[i]);
        let v_normalized = normalize_wind(v[i]);

        rgb_data[i * 3] = u_normalized;
        rgb_data[i * 3 + 1] = v_normalized;
        rgb_data[i * 3 + 2] = 0;
    }

    // Encode as PNG
    encode_png(&rgb_data, WIDTH, HEIGHT)
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

    #[test]
    fn test_normalize_wind() {
        assert_eq!(normalize_wind(-30.0), 0);
        assert_eq!(normalize_wind(0.0), 128); // approximately
        assert_eq!(normalize_wind(30.0), 255);
        assert_eq!(normalize_wind(-50.0), 0); // clamped
        assert_eq!(normalize_wind(50.0), 255); // clamped
    }
}

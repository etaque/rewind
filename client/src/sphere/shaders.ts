export function createVertexShader(gl: WebGLRenderingContext): WebGLShader {
  const shader = gl.createShader(gl.VERTEX_SHADER);
  if (!shader) throw new Error("Can't create vertex shader");

  gl.shaderSource(
    shader,
    `
    attribute vec2 aVertex;

    void main(void) {
      gl_Position = vec4(aVertex, 0.0, 1.0);
    }
    `
  );
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
    throw new Error(
      gl.getShaderInfoLog(shader) ?? "Can't compile vertex shader"
    );
  return shader;
}

export function createFragmentShader(gl: WebGLRenderingContext): WebGLShader {
  const shader = gl.createShader(gl.FRAGMENT_SHADER);
  if (!shader) throw new Error("Can't create fragment shader");

  gl.shaderSource(
    shader,
    `
    precision highp float;

    uniform sampler2D uImage;
    uniform vec2 uTranslate;
    uniform float uScale;
    uniform vec2 uRotate;

    const float c_pi = 3.14159265358979323846264;
    const float c_halfPi = c_pi * 0.5;
    const float c_twoPi = c_pi * 2.0;

    float cosphi0 = cos(uRotate.y);
    float sinphi0 = sin(uRotate.y);

    void main(void) {
      float x = (gl_FragCoord.x - uTranslate.x) / uScale;
      float y = (uTranslate.y - gl_FragCoord.y) / uScale;

      // inverse orthographic projection
      float rho = sqrt(x * x + y * y);
      if (rho > 1.0) return;
      float c = asin(rho);
      float sinc = sin(c);
      float cosc = cos(c);
      float lambda = atan(x * sinc, rho * cosc);
      float phi = asin(y * sinc / rho);

      // inverse rotation
      float cosphi = cos(phi);
      float x1 = cos(lambda) * cosphi;
      float y1 = sin(lambda) * cosphi;
      float z1 = sin(phi);
      lambda = atan(y1, x1 * cosphi0 + z1 * sinphi0) + uRotate.x;
      phi = asin(z1 * cosphi0 - x1 * sinphi0);

      gl_FragColor = texture2D(uImage, vec2((lambda + c_pi) / c_twoPi, (phi + c_halfPi) / c_pi));
    }
    `
  );
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
    throw new Error(
      gl.getShaderInfoLog(shader) ?? "Can't compile fragment shader"
    );
  return shader;
}

export function createVertexBuffer(gl: WebGLRenderingContext): WebGLBuffer {
  const buffer = gl.createBuffer();
  if (!buffer) throw new Error("Can't create buffer");

  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    Float32Array.of(-1, -1, +1, -1, +1, +1, -1, +1),
    gl.STATIC_DRAW
  );
  return buffer;
}

export function createProgram(
  gl: WebGLRenderingContext,
  vertexShader: WebGLShader,
  fragmentShader: WebGLShader
): WebGLProgram {
  const program = gl.createProgram();
  if (!program) throw new Error("Can't create program");

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(program) ?? "Can't link program");
  return program;
}

export function createTexture(
  gl: WebGLRenderingContext,
  imageObject: TexImageSource
): WebGLTexture {
  const texture = gl.createTexture();
  if (!texture) throw new Error("Can't create texture");

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    imageObject
  );
  return texture;
}

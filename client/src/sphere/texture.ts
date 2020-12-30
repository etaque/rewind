import * as wind from "../pngWind";
import * as shaders from "./shaders";
import * as utils from "../utils";
import { Scene } from "../models";

export default function render(
  scene: Scene,
  canvas: HTMLCanvasElement,
  raster: wind.WindRaster
) {
  const gl = canvas.getContext("webgl", { alpha: true })!;
  const { width, height, projection } = scene;

  const vertexShader = shaders.createVertexShader(gl);
  const fragmentShader = shaders.createFragmentShader(gl);
  shaders.createVertexBuffer(gl);

  const imageData = new ImageData(
    new Uint8ClampedArray(raster.data),
    raster.width,
    raster.height
  );
  let texture = shaders.createTexture(gl, imageData);

  const program = shaders.createProgram(gl, vertexShader, fragmentShader);

  const aVertex = gl.getAttribLocation(program, "aVertex");
  const uTranslate = gl.getUniformLocation(program, "uTranslate");
  const uScale = gl.getUniformLocation(program, "uScale");
  const uRotate = gl.getUniformLocation(program, "uRotate");

  const init = () => {
    gl.useProgram(program);
    gl.enableVertexAttribArray(aVertex);
    gl.vertexAttribPointer(aVertex, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(uTranslate, width / 2, height / 2);

    gl.uniform1f(uScale, height / 2 - 1);

    gl.viewport(0, 0, width, height);

    gl.bindTexture(gl.TEXTURE_2D, texture);
  };

  const [lambda, phi] = projection
    .rotate()
    .map((x: number) => utils.toRadians(x));

  redrawWindSpeed(gl, init, uRotate, [lambda, phi]);
}

function redrawWindSpeed(
  gl: WebGLRenderingContext,
  init: () => void,
  uRotate: WebGLUniformLocation | null,
  rotateAngle: [number, number]
) {
  const now = performance.now();
  init();
  gl.uniform2fv(uRotate, rotateAngle);
  gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
  console.log("redraw", Math.round((performance.now() - now) * 1000) + "ms");
}

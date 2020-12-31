import * as d3 from "d3";
import * as wind from "../wind";
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

  // const imageData = new ImageData(
  //   new Uint8ClampedArray(raster.data),
  //   raster.width,
  //   raster.height
  // );
  const imageData = generateImage(raster);
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

function generateImage(raster: wind.WindRaster): ImageData {
  const width = 4096 / 4;
  const height = 2048 / 4;
  const arraySize = 4 * width * height;
  const proj = d3
    .geoEquirectangular()
    .precision(0.1)
    .fitSize([width, height], d3.geoGraticule10());

  let data = new Uint8ClampedArray(arraySize);

  let x = 0;
  let y = 0;

  for (let i = 0; i < arraySize; i = i + 4) {
    // @ts-ignore
    const [lng, lat] = proj.invert([x, y])!;
    const windSpeed = wind.speedAt(raster, { lng, lat });
    if (windSpeed && !isNaN(windSpeed.u) && !isNaN(windSpeed.v)) {
      const speed = utils.speed(windSpeed);
      const color = windColorScale(speed).rgb();

      data[i] = color.r;
      data[i + 1] = color.g;
      data[i + 2] = color.b;
      data[i + 3] = 200;
    } else {
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = 0;
    }
    if (x < width - 1) {
      x = x + 1;
    } else {
      x = 0;
      y = y + 1;
    }
  }

  return new ImageData(data, width);
}

const windColorScale = d3
  .scaleSequential()
  .domain([0, 200])
  .interpolator(function (realWindSpeed: number) {
    const windSpeed = 200 * realWindSpeed;

    const blueToGreen = d3.scaleLinear().domain([0, 35]).range([240, 120]);
    const greenToRed = d3.scaleLinear().domain([30, 70]).range([120, 0]);
    const redToPink = d3.scaleLinear().domain([70, 100]).range([360, 300]);
    const pinkToWhite = d3.scaleLinear().domain([100, 200]).range([0.5, 1]);

    switch (true) {
      case windSpeed < 35:
        return d3.hsl(blueToGreen(windSpeed), 1, 0.5);
      case windSpeed < 70:
        return d3.hsl(greenToRed(windSpeed), 1, 0.5);
      case windSpeed < 100:
        return d3.hsl(redToPink(windSpeed), 1, 0.5);
      default:
        return d3.hsl(300, 1, pinkToWhite(windSpeed));
    }
  });

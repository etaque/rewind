import * as d3 from "d3";
import WindRaster from "../wind-raster";
import * as shaders from "./shaders";
import * as utils from "../utils";
import { Scene, sphereRadius } from "./scene";

export default class Texture {
  readonly canvas: HTMLCanvasElement;
  readonly gl: WebGLRenderingContext;
  readonly init: (scene: Scene) => void;

  wind?: WindRaster;
  texture?: WebGLTexture;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl", { alpha: true })!;
    this.gl = gl;

    const vertexShader = shaders.createVertexShader(gl);
    const fragmentShader = shaders.createFragmentShader(gl);
    shaders.createVertexBuffer(gl);

    const program = shaders.createProgram(gl, vertexShader, fragmentShader);

    const aVertex = gl.getAttribLocation(program, "aVertex");
    const uTranslate = gl.getUniformLocation(program, "uTranslate");
    const uScale = gl.getUniformLocation(program, "uScale");
    const uRotate = gl.getUniformLocation(program, "uRotate");

    this.init = (scene: Scene) => {
      const { width, height } = scene;
      const [lambda, phi] = scene.projection
        .rotate()
        .map((x: number) => utils.toRadians(x));

      gl.useProgram(program);
      gl.enableVertexAttribArray(aVertex);
      gl.vertexAttribPointer(aVertex, 2, gl.FLOAT, false, 0, 0);
      gl.uniform2f(uTranslate, width / 2, height / 2);

      gl.uniform2fv(uRotate, [lambda, phi]);
      gl.uniform1f(uScale, sphereRadius(scene.projection));

      gl.viewport(0, 0, width, height);
    };
  }

  render(scene: Scene, wind: WindRaster) {
    if (!this.texture || wind.id != this.wind?.id) {
      this.wind = wind;
      const imageData = generateImage(wind);
      this.texture = shaders.createTexture(this.gl, imageData);
    }
    this.init(scene);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
    this.gl.drawArrays(this.gl.TRIANGLE_FAN, 0, 4);
  }
}

function generateImage(wind: WindRaster): ImageData {
  const width = 4096 / 4;
  const height = 2048 / 4;
  const arraySize = 4 * width * height;
  const proj = d3
    .geoEquirectangular()
    .precision(0.1)
    .fitSize([width, height], d3.geoGraticule10());

  if (!proj.invert) throw new Error("Invalid projection");

  let data = new Uint8ClampedArray(arraySize);

  let x = 0;
  let y = 0;

  for (let i = 0; i < arraySize; i = i + 4) {
    const [lng, lat] = proj.invert([x, y])!;
    const windSpeed = wind.speedAt({ lng, lat });
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

import * as d3 from "d3";
import * as topojson from "topojson-client";
import { GeoPermissibleObjects, GeoSphere } from "d3";
import { Topology } from "topojson-specification";
import { Course, LngLat, GenericView } from "../models";
import * as wind from "../pngWind";
import * as shaders from "./shaders";
import { toRadians } from "../utils";

const sphere: GeoSphere = { type: "Sphere" };

export class SphereView implements GenericView<wind.WindRaster> {
  readonly course: Course;
  readonly node: HTMLElement;

  width: number;
  height: number;

  uvRaster?: wind.WindRaster;
  speedRaster?: wind.WindRaster;
  position: LngLat;

  sphereCanvas: HTMLCanvasElement;
  windCanvas: HTMLCanvasElement;
  land?: GeoPermissibleObjects;

  constructor(node: HTMLElement, course: Course) {
    this.course = course;
    this.node = node;
    this.position = course.start;
    this.width = document.body.clientWidth;
    this.height = document.body.clientHeight;

    this.windCanvas = d3
      .select(this.node)
      .append("canvas")
      .attr("class", "wind fixed opacity-80")
      .attr("width", this.width)
      .attr("height", this.height)
      .node()!;

    this.sphereCanvas = d3
      .select(this.node)
      .append("canvas")
      .attr("class", "sphere fixed")
      .attr("width", this.width)
      .attr("height", this.height)
      .node()!;
  }

  updateWindUV(raster: wind.WindRaster) {
    this.uvRaster = raster;
    this.render();
  }

  updateWindSpeed(raster: wind.WindRaster) {
    this.speedRaster = raster;
    this.render();
  }

  updatePosition(pos: LngLat) {
    this.position = pos;
    this.render();
  }

  async render() {
    const projection = d3
      .geoOrthographic()
      .precision(0.1)
      .fitSize([this.width, this.height], sphere);

    if (this.speedRaster) {
      renderWindSpeed(
        this.windCanvas,
        this.width,
        this.height,
        projection,
        this.speedRaster
      );
    }

    if (!this.land) {
      const topo = (await fetchJson("/sphere/land-110m.json")) as Topology;
      this.land = topojson.feature(topo, topo.objects.land);
    }
    renderLand(
      this.sphereCanvas,
      this.width,
      this.height,
      projection,
      this.land
    );
  }
}

function renderLand(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  projection: d3.GeoProjection,
  land: GeoPermissibleObjects
) {
  const graticule = d3.geoGraticule10();
  const context = canvas.getContext("2d")!;
  const path = d3.geoPath(projection, context);
  context.clearRect(0, 0, width, height);

  context.strokeStyle = "rgba(255, 255, 255, 0.8)";
  context.beginPath(), path(land), context.stroke();

  context.strokeStyle = "rgba(221, 221, 221, 0.2)";
  context.beginPath(), path(graticule), context.stroke();
}

function renderWindSpeed(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  projection: d3.GeoProjection,
  raster: wind.WindRaster
) {
  const gl = canvas.getContext("webgl", { alpha: true })!;

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

  const [lambda, phi] = projection.rotate().map((x) => toRadians(x));

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

async function fetchJson(path: string): Promise<any> {
  const res = await fetch(path);
  return res.json();
}

import WindRaster from "../wind-raster";
import * as shaders from "./shaders";
import * as utils from "../utils";
import { Scene, sphereRadius } from "./scene";
import type { WorkerResponse } from "./wind-texture.worker";
import WindTextureWorker from "./wind-texture.worker?worker";

export default class Texture {
  readonly canvas: HTMLCanvasElement;
  readonly gl: WebGLRenderingContext;
  readonly init: (scene: Scene) => void;

  wind?: WindRaster;
  texture?: WebGLTexture;
  pendingWindId?: string;

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
    const needsNewTexture = wind.id !== this.wind?.id;
    const isAlreadyPending = wind.id === this.pendingWindId;

    if (needsNewTexture && !isAlreadyPending) {
      this.pendingWindId = wind.id;
      this.generateTextureAsync(wind);
    }

    // Render with existing texture while new one is being generated
    if (this.texture) {
      this.init(scene);
      this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
      this.gl.drawArrays(this.gl.TRIANGLE_FAN, 0, 4);
    }
  }

  private generateTextureAsync(wind: WindRaster) {
    const worker = new WindTextureWorker();

    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      // Only update if this is still the wind we want
      if (wind.id === this.pendingWindId) {
        // Copy into a new Uint8ClampedArray to satisfy ImageData constructor
        const data = new Uint8ClampedArray(e.data.data);
        const imageData = new ImageData(data, e.data.width, e.data.height);
        this.texture = shaders.createTexture(this.gl, imageData);
        this.wind = wind;
        this.pendingWindId = undefined;
      }
      worker.terminate();
    };

    worker.onerror = () => {
      this.pendingWindId = undefined;
      worker.terminate();
    };

    worker.postMessage(
      {
        rasterData: wind.raster.data,
        rasterWidth: wind.raster.width,
        rasterHeight: wind.raster.height,
      },
      [wind.raster.data.buffer.slice(0)], // Copy buffer since we still need it
    );
  }
}

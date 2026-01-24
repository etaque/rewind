import WindRaster from "../wind-raster";
import * as shaders from "./shaders";
import * as utils from "../utils";
import { Scene, sphereRadius } from "./scene";
import type { WorkerResponse } from "./wind-texture.worker";
import WindTextureWorker from "./wind-texture.worker?worker";

export type WindTextureParams = {
  currentRaster: WindRaster;
  nextRaster?: WindRaster;
  interpolationFactor: number;
};

export default class Texture {
  readonly canvas: HTMLCanvasElement;
  readonly gl: WebGLRenderingContext;
  readonly dpr: number;
  readonly init: (scene: Scene) => void;

  // Track what's currently rendered to avoid unnecessary regeneration
  private renderedCurrentTime?: number;
  private renderedNextTime?: number;
  private renderedFactor?: number;

  texture?: WebGLTexture;
  pendingGeneration?: {
    currentTime: number;
    nextTime?: number;
    factor: number;
  };

  // Callback to notify when texture is ready (for triggering re-render)
  onTextureReady?: () => void;

  constructor(canvas: HTMLCanvasElement, dpr: number = 1) {
    this.canvas = canvas;
    this.dpr = dpr;
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
      // uTranslate must be in physical pixels (DPR-scaled) to match gl_FragCoord
      gl.uniform2f(uTranslate, (width * this.dpr) / 2, (height * this.dpr) / 2);

      gl.uniform2fv(uRotate, [lambda, phi]);
      gl.uniform1f(uScale, sphereRadius(scene.projection) * this.dpr);

      gl.viewport(0, 0, width * this.dpr, height * this.dpr);
    };
  }

  render(scene: Scene, params: WindTextureParams) {
    const { currentRaster, nextRaster, interpolationFactor } = params;

    // Quantize interpolation factor to avoid too frequent updates (every ~10% change)
    const quantizedFactor = Math.round(interpolationFactor * 10) / 10;

    const needsNewTexture =
      currentRaster.time !== this.renderedCurrentTime ||
      nextRaster?.time !== this.renderedNextTime ||
      quantizedFactor !== this.renderedFactor;

    const isAlreadyPending =
      this.pendingGeneration?.currentTime === currentRaster.time &&
      this.pendingGeneration?.nextTime === nextRaster?.time &&
      this.pendingGeneration?.factor === quantizedFactor;

    if (needsNewTexture && !isAlreadyPending) {
      this.pendingGeneration = {
        currentTime: currentRaster.time,
        nextTime: nextRaster?.time,
        factor: quantizedFactor,
      };
      this.generateTextureAsync(currentRaster, nextRaster, quantizedFactor);
    }

    // Render with existing texture while new one is being generated
    if (this.texture) {
      this.init(scene);
      this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
      this.gl.drawArrays(this.gl.TRIANGLE_FAN, 0, 4);
    }
  }

  private generateTextureAsync(
    currentRaster: WindRaster,
    nextRaster: WindRaster | undefined,
    interpolationFactor: number,
  ) {
    const worker = new WindTextureWorker();
    const expectedGeneration = this.pendingGeneration;

    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      // Only update if this is still the generation we want
      if (expectedGeneration && this.pendingGeneration === expectedGeneration) {
        // Copy into a new Uint8ClampedArray to satisfy ImageData constructor
        const data = new Uint8ClampedArray(e.data.data);
        const imageData = new ImageData(data, e.data.width, e.data.height);
        this.texture = shaders.createTexture(this.gl, imageData);
        this.renderedCurrentTime = expectedGeneration.currentTime;
        this.renderedNextTime = expectedGeneration.nextTime;
        this.renderedFactor = expectedGeneration.factor;
        this.pendingGeneration = undefined;

        // Notify that texture is ready for rendering
        this.onTextureReady?.();
      }
      worker.terminate();
    };

    worker.onerror = () => {
      if (this.pendingGeneration === expectedGeneration) {
        this.pendingGeneration = undefined;
      }
      worker.terminate();
    };

    const currentData = new Uint8ClampedArray(currentRaster.raster.data);
    const nextData = nextRaster
      ? new Uint8ClampedArray(nextRaster.raster.data)
      : undefined;

    const message: {
      currentRasterData: Uint8ClampedArray;
      currentRasterWidth: number;
      nextRasterData?: Uint8ClampedArray;
      nextRasterWidth?: number;
      interpolationFactor: number;
    } = {
      currentRasterData: currentData,
      currentRasterWidth: currentRaster.raster.width,
      interpolationFactor,
    };

    const transferables: ArrayBuffer[] = [currentData.buffer];

    if (nextData) {
      message.nextRasterData = nextData;
      message.nextRasterWidth = nextRaster!.raster.width;
      transferables.push(nextData.buffer);
    }

    worker.postMessage(message, transferables);
  }
}

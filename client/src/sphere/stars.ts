import { Scene } from "./scene";

type Star = {
  x: number; // 0-1 normalized screen position
  y: number;
  size: number; // radius in pixels
  brightness: number; // alpha 0-1
};

const STAR_COUNT = 300;

export default class Stars {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private stars: Star[];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.stars = this.generateStars();
  }

  private generateStars(): Star[] {
    const stars: Star[] = [];
    for (let i = 0; i < STAR_COUNT; i++) {
      stars.push({
        x: Math.random(),
        y: Math.random(),
        size: 0.5 + Math.random() * 1.5,
        brightness: 0.3 + Math.random() * 0.7,
      });
    }
    return stars;
  }

  render(scene: Scene) {
    const { dpr, sphereCenter, sphereRadius } = scene;
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#000005";
    ctx.fillRect(0, 0, width, height);

    // Draw stars
    for (const star of this.stars) {
      const x = star.x * width;
      const y = star.y * height;
      const radius = star.size * dpr;

      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${star.brightness})`;
      ctx.fill();
    }

    // Fill sphere with deep ocean blue base color
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(
      sphereCenter.x * dpr,
      sphereCenter.y * dpr,
      sphereRadius * dpr,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#0a1628";
    ctx.fill();
  }
}

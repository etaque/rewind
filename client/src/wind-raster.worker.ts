export type WorkerRequest = {
  url: string;
};

export type WorkerResponse = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const response = await fetch(e.data.url, { mode: "cors" });
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);

  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0);

  const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);

  self.postMessage(
    { data: imageData.data, width: bitmap.width, height: bitmap.height },
    [imageData.data.buffer],
  );
};

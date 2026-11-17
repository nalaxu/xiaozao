// 拍照识别前在浏览器里缩图（技术方案 7.2）：长边 1024 像素、JPEG 0.8。
// 经 canvas 重新编码后不含 EXIF 与位置信息（PRD F4）。

export async function shrinkPhoto(file: File, maxEdge = 1024, quality = 0.8): Promise<string> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", quality);
}

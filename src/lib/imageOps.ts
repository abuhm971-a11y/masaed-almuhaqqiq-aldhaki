/** Crops a double-page-spread image into its right and left halves at
 * `splitPercent` (0-100, measured from the visual left edge), following
 * the same manual-split-line approach used by book-scan tools like
 * ScanTailor. Returns two PNG data URLs. */
export function cropImageHalves(
  imageUrl: string,
  splitPercent: number
): Promise<{ left: string; right: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const splitX = Math.round((img.naturalWidth * splitPercent) / 100);
      const makeCrop = (sx: number, sw: number) => {
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, sw);
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("تعذّر إنشاء لوحة الرسم لقص الصورة");
        ctx.drawImage(img, sx, 0, sw, img.naturalHeight, 0, 0, sw, img.naturalHeight);
        return canvas.toDataURL("image/png");
      };
      try {
        resolve({
          left: makeCrop(0, splitX),
          right: makeCrop(splitX, img.naturalWidth - splitX),
        });
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error("تعذّر تحميل الصورة للقص"));
    img.src = imageUrl;
  });
}

export async function dataUrlToFile(dataUrl: string, filename: string): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], filename, { type: blob.type });
}

/** Rotates an image 90° clockwise using canvas. Returns a PNG data URL. */
export function rotateImage90(imageUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalHeight;
      canvas.height = img.naturalWidth;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("تعذّر إنشاء لوحة الرسم للتدوير"));
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("تعذّر تحميل الصورة للتدوير"));
    img.src = imageUrl;
  });
}

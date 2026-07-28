// Extract a few evenly-spaced frames from a local video File, in the browser,
// so the teardown endpoint can analyse the actual footage without server-side
// ffmpeg. Frames are downscaled + JPEG-encoded to stay well under the model's
// per-image byte cap. Only works for local files (canvas readback needs
// same-origin pixels) — remote URLs fall back to text-only analysis.

const MAX_EDGE = 768; // longest side of each frame

function seek(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      resolve();
    };
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", () => reject(new Error("seek failed")), { once: true });
    video.currentTime = time;
  });
}

export async function extractFrames(file: File, count = 4): Promise<Blob[]> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("could not load video"));
    });

    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) throw new Error("video has no dimensions");
    const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas 2d context");

    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const blobs: Blob[] = [];
    for (let i = 0; i < count; i++) {
      const t = duration ? (duration * (i + 0.5)) / count : 0;
      await seek(video, t);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((r) =>
        canvas.toBlob(r, "image/jpeg", 0.8),
      );
      if (blob) blobs.push(blob);
    }
    return blobs;
  } finally {
    URL.revokeObjectURL(url);
  }
}

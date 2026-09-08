/**
 * VERIXA Browser Video Frame Extractor
 * Uses offscreen HTML5 <video> and <canvas> for hardware-accelerated keyframe extraction.
 * Extracts frames at configurable intervals for authentic frame-by-frame AI moderation.
 */

export interface ExtractedVideoFrame {
  timestamp: number; // in seconds
  data: string; // base64 JPEG data URL
}

export interface VideoExtractionResult {
  duration: number;
  width: number;
  height: number;
  intervalSeconds: number;
  frames: ExtractedVideoFrame[];
}

/**
 * Extracts frames at configurable intervals from a video File or blob URL.
 *
 * @param videoSource Video File or URL
 * @param intervalSeconds Configurable interval in seconds between frame samples (default: 1.0s)
 * @param maxFrames Maximum number of representative frames to extract (default: 8)
 */
export async function extractVideoFrames(
  videoSource: File | string,
  intervalSeconds: number = 1.0,
  maxFrames: number = 8
): Promise<VideoExtractionResult> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';

    let objectUrl: string | null = null;
    if (typeof videoSource === 'string') {
      video.src = videoSource;
    } else {
      objectUrl = URL.createObjectURL(videoSource);
      video.src = objectUrl;
    }

    const cleanup = () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
      video.removeAttribute('src');
      video.load();
    };

    video.onerror = () => {
      cleanup();
      reject(new Error('Failed to load video for frame extraction.'));
    };

    video.onloadedmetadata = async () => {
      try {
        const duration = video.duration || 1;
        const width = video.videoWidth || 320;
        const height = video.videoHeight || 240;

        // Calculate sample timestamps at configurable intervals
        const timestamps: number[] = [];
        for (let t = 0; t < duration && timestamps.length < maxFrames; t += intervalSeconds) {
          timestamps.push(Math.round(t * 100) / 100);
        }

        // Always include last keyframe if video is long enough and not already included
        if (duration > 1.5 && !timestamps.includes(Math.floor(duration - 0.5)) && timestamps.length < maxFrames) {
          timestamps.push(Math.floor(duration - 0.5));
        }

        // Target canvas resolution (scaled down for efficient network transmission)
        const targetWidth = Math.min(360, width);
        const targetHeight = Math.round((targetWidth / width) * height);

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          cleanup();
          return resolve({
            duration,
            width,
            height,
            intervalSeconds,
            frames: [],
          });
        }

        const extractedFrames: ExtractedVideoFrame[] = [];

        for (const time of timestamps) {
          await new Promise<void>((seekResolve) => {
            const onSeeked = () => {
              video.removeEventListener('seeked', onSeeked);
              try {
                ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
                extractedFrames.push({
                  timestamp: time,
                  data: dataUrl,
                });
              } catch (drawErr) {
                console.warn('Frame capture error at timestamp:', time, drawErr);
              }
              seekResolve();
            };

            video.addEventListener('seeked', onSeeked);
            video.currentTime = Math.min(time, duration - 0.1);
          });
        }

        cleanup();
        resolve({
          duration,
          width,
          height,
          intervalSeconds,
          frames: extractedFrames,
        });
      } catch (err) {
        cleanup();
        reject(err);
      }
    };
  });
}

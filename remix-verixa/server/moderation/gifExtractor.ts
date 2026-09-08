/**
 * VERIXA Pure-TypeScript GIF Frame Extractor
 * Zero external native dependencies. Parses GIF87a / GIF89a binary specifications.
 */

export interface ExtractedGifFrame {
  index: number;
  delayMs: number;
  width: number;
  height: number;
  isKeyframe: boolean;
  dataUrl: string;
}

export interface GifParseResult {
  isGif: boolean;
  version: string;
  width: number;
  height: number;
  totalFrames: number;
  frames: ExtractedGifFrame[];
}

/**
 * Checks if a buffer or base64 string begins with GIF87a or GIF89a header
 */
export function isGifBuffer(buffer: Buffer): boolean {
  if (!buffer || buffer.length < 6) return false;
  const header = buffer.toString('ascii', 0, 6);
  return header === 'GIF87a' || header === 'GIF89a';
}

/**
 * Converts a data URL or base64 string to a Buffer
 */
export function bufferFromMediaContent(content: string): Buffer | null {
  if (!content) return null;
  try {
    if (content.startsWith('data:')) {
      const commaIdx = content.indexOf(',');
      if (commaIdx !== -1) {
        return Buffer.from(content.slice(commaIdx + 1), 'base64');
      }
    }
    // Check if raw base64
    if (/^[A-Za-z0-9+/=]+$/.test(content.slice(0, 100))) {
      return Buffer.from(content, 'base64');
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Extracts frames from an animated GIF buffer.
 * Constructs valid single-frame GIF buffers for each representative frame.
 */
export function extractGifFrames(
  buffer: Buffer,
  maxRepresentativeFrames: number = 5
): GifParseResult {
  if (!isGifBuffer(buffer)) {
    return {
      isGif: false,
      version: 'unknown',
      width: 0,
      height: 0,
      totalFrames: 0,
      frames: [],
    };
  }

  const version = buffer.toString('ascii', 0, 6);
  const width = buffer.readUInt16LE(6);
  const height = buffer.readUInt16LE(8);
  const packed = buffer.readUInt8(10);
  const hasGlobalColorTable = (packed & 0x80) !== 0;
  const colorTableSize = 3 * Math.pow(2, (packed & 0x07) + 1);

  let offset = 13;
  let globalColorTable: Buffer | null = null;

  if (hasGlobalColorTable) {
    globalColorTable = buffer.slice(offset, offset + colorTableSize);
    offset += colorTableSize;
  }

  const frameBlocks: Array<{
    gce?: Buffer;
    imageDescriptor: Buffer;
    dataBlocks: Buffer;
    delayMs: number;
    width: number;
    height: number;
  }> = [];

  let currentGce: Buffer | undefined;
  let currentDelay = 100; // default 100ms

  while (offset < buffer.length) {
    const blockType = buffer.readUInt8(offset);

    // 0x3B = Trailer (end of GIF)
    if (blockType === 0x3b) {
      break;
    }

    // 0x21 = Extension block
    if (blockType === 0x21) {
      const extLabel = buffer.readUInt8(offset + 1);
      offset += 2;

      // 0xF9 = Graphic Control Extension
      if (extLabel === 0xf9) {
        const blockSize = buffer.readUInt8(offset);
        const gceStart = offset - 2;
        const gceEnd = offset + 1 + blockSize + 1; // +1 for terminator 0x00
        currentGce = buffer.slice(gceStart, gceEnd);

        // Delay time is at offset + 2 (in 1/100ths of a second)
        const delay100ths = buffer.readUInt16LE(offset + 2);
        currentDelay = delay100ths > 0 ? delay100ths * 10 : 100;

        offset = gceEnd;
      } else {
        // Skip sub-blocks
        let subBlockSize = buffer.readUInt8(offset);
        offset++;
        while (subBlockSize > 0 && offset < buffer.length) {
          offset += subBlockSize;
          if (offset >= buffer.length) break;
          subBlockSize = buffer.readUInt8(offset);
          offset++;
        }
      }
    }
    // 0x2C = Image Descriptor
    else if (blockType === 0x2c) {
      const imgStart = offset;
      const imgWidth = buffer.readUInt16LE(offset + 5);
      const imgHeight = buffer.readUInt16LE(offset + 7);
      const imgPacked = buffer.readUInt8(offset + 9);
      const hasLocalColorTable = (imgPacked & 0x80) !== 0;

      offset += 10;
      if (hasLocalColorTable) {
        const localTableSize = 3 * Math.pow(2, (imgPacked & 0x07) + 1);
        offset += localTableSize;
      }

      // LZW minimum code size
      offset += 1;

      // Read image data sub-blocks
      const dataStart = offset;
      let dataSubBlockSize = buffer.readUInt8(offset);
      offset++;
      while (dataSubBlockSize > 0 && offset < buffer.length) {
        offset += dataSubBlockSize;
        if (offset >= buffer.length) break;
        dataSubBlockSize = buffer.readUInt8(offset);
        offset++;
      }

      const imageDescriptor = buffer.slice(imgStart, dataStart);
      const dataBlocks = buffer.slice(dataStart, offset);

      frameBlocks.push({
        gce: currentGce,
        imageDescriptor,
        dataBlocks,
        delayMs: currentDelay,
        width: imgWidth || width,
        height: imgHeight || height,
      });

      currentGce = undefined;
    } else {
      offset++;
    }
  }

  const totalFrames = frameBlocks.length;
  if (totalFrames === 0) {
    // If no animated frames parsed, return original as single frame
    return {
      isGif: true,
      version,
      width,
      height,
      totalFrames: 1,
      frames: [
        {
          index: 0,
          delayMs: 100,
          width,
          height,
          isKeyframe: true,
          dataUrl: `data:image/gif;base64,${buffer.toString('base64')}`,
        },
      ],
    };
  }

  // Select representative frame indices (e.g. 0, middle, last, evenly spaced)
  const selectedIndices = new Set<number>();
  selectedIndices.add(0);
  if (totalFrames > 1) {
    selectedIndices.add(totalFrames - 1);
  }
  if (totalFrames > 2) {
    selectedIndices.add(Math.floor(totalFrames / 2));
  }

  const step = Math.max(1, Math.floor(totalFrames / maxRepresentativeFrames));
  for (let i = 0; i < totalFrames && selectedIndices.size < maxRepresentativeFrames; i += step) {
    selectedIndices.add(i);
  }

  const sortedIndices = Array.from(selectedIndices).sort((a, b) => a - b);
  const frames: ExtractedGifFrame[] = [];

  for (const idx of sortedIndices) {
    const fb = frameBlocks[idx];
    if (!fb) continue;

    // Construct a standalone single-frame GIF
    // Header (6 bytes) + Screen Descriptor (7 bytes) + Global Color Table + [GCE] + Image Descriptor + Image Data + Trailer (0x3B)
    const headerBuf = Buffer.from(version, 'ascii');
    const lsdBuf = buffer.slice(6, 13);
    const parts: Buffer[] = [headerBuf, lsdBuf];

    if (globalColorTable) {
      parts.push(globalColorTable);
    }
    if (fb.gce) {
      parts.push(fb.gce);
    }
    parts.push(fb.imageDescriptor);
    parts.push(fb.dataBlocks);
    parts.push(Buffer.from([0x3b])); // Trailer

    const singleFrameGif = Buffer.concat(parts);
    frames.push({
      index: idx,
      delayMs: fb.delayMs,
      width: fb.width,
      height: fb.height,
      isKeyframe: idx === 0 || idx === Math.floor(totalFrames / 2),
      dataUrl: `data:image/gif;base64,${singleFrameGif.toString('base64')}`,
    });
  }

  return {
    isGif: true,
    version,
    width,
    height,
    totalFrames,
    frames,
  };
}

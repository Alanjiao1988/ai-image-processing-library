export interface ImageDimensions {
  width: number | null;
  height: number | null;
}

const PNG_SIGNATURE = "89504e470d0a1a0a";

function isPng(buffer: Buffer) {
  return buffer.length >= 24 && buffer.subarray(0, 8).toString("hex") === PNG_SIGNATURE;
}

function isJpeg(buffer: Buffer) {
  return buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8;
}

function getPngDimensions(buffer: Buffer): ImageDimensions {
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function getJpegDimensions(buffer: Buffer): ImageDimensions {
  let offset = 2;

  while (offset < buffer.length) {
    while (offset < buffer.length && buffer[offset] === 0xff) {
      offset += 1;
    }

    const marker = buffer[offset];
    offset += 1;

    if (!marker || marker === 0xd9 || marker === 0xda) {
      break;
    }

    if (offset + 1 >= buffer.length) {
      break;
    }

    const segmentLength = buffer.readUInt16BE(offset);
    offset += 2;

    if (segmentLength < 2 || offset + segmentLength - 2 > buffer.length) {
      break;
    }

    const isStartOfFrame =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);

    if (isStartOfFrame) {
      return {
        height: buffer.readUInt16BE(offset + 1),
        width: buffer.readUInt16BE(offset + 3),
      };
    }

    offset += segmentLength - 2;
  }

  return {
    width: null,
    height: null,
  };
}

export function extractImageDimensions(buffer: Buffer): ImageDimensions {
  try {
    if (isPng(buffer)) {
      return getPngDimensions(buffer);
    }

    if (isJpeg(buffer)) {
      return getJpegDimensions(buffer);
    }
  } catch {
    return {
      width: null,
      height: null,
    };
  }

  return {
    width: null,
    height: null,
  };
}

import { env } from "../config/env";
import type { ImageProvider } from "./image-provider";
import { GptImageProvider } from "./gpt-image.provider";

export function createImageProvider(): ImageProvider {
  switch (env.IMAGE_PROVIDER) {
    case "gpt-image":
      return new GptImageProvider();
    default:
      throw new Error(`Unsupported IMAGE_PROVIDER: ${env.IMAGE_PROVIDER}`);
  }
}

export const imageProvider = createImageProvider();

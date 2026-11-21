import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

initOpenNextCloudflareForDev({ configPath: "./freebuff.wrangler.jsonc" });

const allowedDevOrigins = [
  "localhost:3000",
  "127.0.0.1:3000",
  "*.style.dev",
  process.env.NEXT_PUBLIC_PREVIEW_HOST,
].filter(Boolean) as string[];

const nextConfig: NextConfig = {
  allowedDevOrigins,
};

export default nextConfig;

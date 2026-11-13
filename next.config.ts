import type { NextConfig } from "next";

// Eksport statyczny (out/) do hostingu takiego jak GitHub Pages.
// BASE_PATH ustawia workflow na /NAZWA-REPO (projektowa strona Pages); lokalnie zostaje pusty.
const basePath = process.env.BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  assetPrefix: basePath || undefined,
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;

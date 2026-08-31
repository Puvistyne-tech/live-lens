import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const faceApiEsm = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "node_modules/@vladmandic/face-api/dist/face-api.esm.js",
);

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.1.229", "172.30.199.130"],
  transpilePackages: ["three", "@react-three/fiber", "@react-three/drei"],
  // Package "main" points at the Node build; force browser ESM for client bundles.
  turbopack: {
    resolveAlias: {
      "@vladmandic/face-api": faceApiEsm,
    },
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@vladmandic/face-api": faceApiEsm,
    };
    return config;
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "pub-9b19ba747aff4dacacc0e88b4aaf03db.r2.dev",
      },
    ],
  },
};

export default nextConfig;

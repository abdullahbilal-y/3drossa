/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // 3drossa ships untranspiled source with JSX; three does the same for its
  // ESM helpers. Both are compiled by the host, which is what lets the engine
  // stay source-only during development.
  transpilePackages: ["3drossa", "three"],
};

export default nextConfig;

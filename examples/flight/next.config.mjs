/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // 3drossa ships compiled ESM, so it needs no transpiling by the host - only
  // three does, for its untranspiled ESM helpers. Keeping 3drossa OUT of this
  // list is deliberate: it is how the demo proves the published package works
  // in a project that has done nothing special to accommodate it.
  transpilePackages: ["three"],
};

export default nextConfig;

/**
 * The demo, for local development and for GitHub Pages.
 *
 * ROSSA_PAGES=1 switches it to a static export under the repository's Pages
 * path. Everything keyed on that flag exists because Pages serves plain files
 * from a subdirectory, which is a meaningfully different target from `next dev`.
 */
const PAGES = process.env.ROSSA_PAGES === "1";

/** github.io serves a project site from /<repo>, not from the root. */
const BASE = "/3drossa";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR || ".next",

  // 3drossa ships compiled ESM, so it needs no transpiling by the host - only
  // three does, for its untranspiled ESM helpers. Keeping 3drossa OUT of this
  // list is deliberate: it is how the demo proves the published package works
  // in a project that has done nothing special to accommodate it.
  transpilePackages: ["three"],

  /**
   * The save endpoint is a DEVELOPMENT route, and a static export has nowhere
   * to run it — a POST handler simply fails `output: "export"`.
   *
   * Rather than delete the file in CI and restore it afterwards, it is named
   * `route.dev.js` and is only counted as a route while `.dev.js` is in
   * pageExtensions. The file is then inert in the Pages build by construction,
   * which is harder to get wrong than a build script that moves source around.
   */
  pageExtensions: PAGES ? ["jsx", "js"] : ["dev.js", "jsx", "js"],

  ...(PAGES
    ? {
        output: "export",
        basePath: BASE,
        assetPrefix: `${BASE}/`,
        // No server in an export, so nothing to optimise images with.
        images: { unoptimized: true },
        // Pages resolves /path/ to /path/index.html.
        trailingSlash: true,
      }
    : {}),
};

export default nextConfig;

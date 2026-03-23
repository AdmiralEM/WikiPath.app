// =============================================================================
// WikiPath Extension — esbuild Build Script
// =============================================================================

import * as esbuild from "esbuild";
import { copyFileSync, mkdirSync, cpSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const isWatch = process.argv.includes("--watch");

const outdir = join(__dirname, "dist");

/** @type {import("esbuild").BuildOptions} */
const buildOptions = {
  entryPoints: [
    join(__dirname, "src/background.ts"),
    join(__dirname, "src/content.ts"),
    join(__dirname, "src/popup.ts"),
  ],
  bundle: true,
  outdir,
  format: "esm",
  platform: "browser",
  target: ["chrome120"],
  sourcemap: true,
  logLevel: "info",
};

async function copyStaticFiles() {
  mkdirSync(outdir, { recursive: true });
  copyFileSync(
    join(__dirname, "src/manifest.json"),
    join(outdir, "manifest.json")
  );
  copyFileSync(
    join(__dirname, "src/popup.html"),
    join(outdir, "popup.html")
  );
  // Copy icons directory if it exists
  try {
    cpSync(join(__dirname, "icons"), join(outdir, "icons"), { recursive: true });
  } catch {
    // Icons directory may not exist yet (placeholder phase)
  }
}

if (isWatch) {
  const ctx = await esbuild.context(buildOptions);
  await copyStaticFiles();
  await ctx.watch();
  console.log("Watching for changes...");
} else {
  await esbuild.build(buildOptions);
  await copyStaticFiles();
  console.log("Extension build complete.");
}

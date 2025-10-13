#!/usr/bin/env node
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");

async function copyDir(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

async function main() {
  const standaloneDir = path.join(
    projectRoot,
    ".next",
    "standalone",
    "work",
    "dspyground"
  );

  console.log("📦 Preparing standalone build...");

  // Copy .next/static to standalone
  const staticSrc = path.join(projectRoot, ".next", "static");
  const staticDest = path.join(standaloneDir, ".next", "static");

  console.log("   Copying .next/static...");
  await copyDir(staticSrc, staticDest);

  // Copy public to standalone
  const publicSrc = path.join(projectRoot, "public");
  const publicDest = path.join(standaloneDir, "public");

  console.log("   Copying public...");
  await copyDir(publicSrc, publicDest);

  console.log("✅ Standalone build prepared successfully!");
}

main().catch((err) => {
  console.error("❌ Error preparing standalone build:", err);
  process.exit(1);
});

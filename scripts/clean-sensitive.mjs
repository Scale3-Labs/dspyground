#!/usr/bin/env node
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");

async function deleteRecursive(dir, pattern) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (entry.name === ".dspyground") {
          console.log(`   Deleting ${fullPath}`);
          await fs.rm(fullPath, { recursive: true, force: true });
        } else {
          await deleteRecursive(fullPath, pattern);
        }
      } else if (
        entry.isFile() &&
        entry.name.startsWith(".env") &&
        entry.name !== ".env.example"
      ) {
        console.log(`   Deleting ${fullPath}`);
        await fs.unlink(fullPath);
      }
    }
  } catch (err) {
    // Directory doesn't exist or can't be read, skip
  }
}

async function main() {
  const standaloneDir = path.join(projectRoot, ".next", "standalone");

  console.log("🧹 Cleaning sensitive files from standalone build...");

  await deleteRecursive(standaloneDir);

  console.log("✅ Sensitive files cleaned!");
}

main().catch((err) => {
  console.error("❌ Error cleaning sensitive files:", err);
  process.exit(1);
});

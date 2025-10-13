import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "cli/index.ts",
    init: "cli/init.ts",
    dev: "cli/dev.ts",
  },
  format: ["esm"],
  dts: true,
  outDir: "dist/cli",
  clean: true,
  sourcemap: true,
  target: "node18",
  shims: true,
  treeshake: true,
  tsconfig: "tsconfig.cli.json",
  skipNodeModulesBundle: true,
  onSuccess: async () => {
    const fs = await import("fs");
    const path = await import("path");

    // Add shebang to index.mjs
    const indexPath = path.join(process.cwd(), "dist/cli/index.mjs");
    const content = fs.readFileSync(indexPath, "utf-8");
    if (!content.startsWith("#!/usr/bin/env node")) {
      fs.writeFileSync(indexPath, `#!/usr/bin/env node\n${content}`);
    }

    // Make executable
    fs.chmodSync(indexPath, "755");
  },
});

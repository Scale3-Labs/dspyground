import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function findAvailablePort(startPort: number): Promise<number> {
  const net = await import("net");
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", () => {
      resolve(findAvailablePort(startPort + 1));
    });
    server.listen(startPort, () => {
      const port = (server.address() as any).port;
      server.close(() => {
        resolve(port);
      });
    });
  });
}

export async function devCommand() {
  try {
    const cwd = process.cwd();

    // Check if dspyground.config.ts exists
    const configPath = path.join(cwd, "dspyground.config.ts");
    try {
      await fs.access(configPath);
    } catch {
      console.error(
        "❌ dspyground.config.ts not found. Run 'npx dspyground init' first."
      );
      process.exit(1);
    }

    // Check if .dspyground/data exists
    const dataDir = path.join(cwd, ".dspyground", "data");
    try {
      await fs.access(dataDir);
    } catch {
      console.error(
        "❌ .dspyground/data directory not found. Run 'npx dspyground init' first."
      );
      process.exit(1);
    }

    console.log("🚀 Starting DSPyGround server...\n");

    // Set environment variables
    process.env.DSPYGROUND_DATA_DIR = dataDir;
    process.env.DSPYGROUND_CONFIG_PATH = configPath;

    // Find available port
    const port = await findAvailablePort(3000);
    process.env.PORT = port.toString();

    console.log(`📂 Data directory: ${dataDir}`);
    console.log(`⚙️  Config: ${configPath}`);
    console.log(`🌐 Server will start on: http://localhost:${port}\n`);

    // Find the dspyground package root
    // __dirname is dist/cli, so package root is ../..
    const packageRoot = path.join(__dirname, "..", "..");

    // Check if we're in development (has src/) or production (has .next/)
    const hasSrc = await fs
      .access(path.join(packageRoot, "src"))
      .then(() => true)
      .catch(() => false);
    const hasNext = await fs
      .access(path.join(packageRoot, ".next"))
      .then(() => true)
      .catch(() => false);

    let command: string;
    let args: string[];

    if (hasSrc && !hasNext) {
      // Development mode: run next dev from package root
      console.log("🔧 Running in development mode\n");
      command = "npx";
      args = ["next", "dev", "-p", port.toString()];
    } else if (hasNext) {
      // Production mode: run next start (works with standalone)
      console.log("🚀 Running in production mode\n");
      command = "npx";
      args = ["next", "start", "-p", port.toString()];
    } else {
      throw new Error("Could not find Next.js app in dspyground package");
    }

    const child = spawn(command, args, {
      cwd: packageRoot,
      stdio: "inherit",
      env: {
        ...process.env,
        NODE_ENV: hasNext && !hasSrc ? "production" : "development",
        PORT: port.toString(),
      },
    });

    child.on("error", (error) => {
      console.error("❌ Failed to start server:", error);
      process.exit(1);
    });

    child.on("exit", (code) => {
      if (code !== 0) {
        console.error(`❌ Server exited with code ${code}`);
        process.exit(code || 1);
      }
    });

    // Handle shutdown gracefully
    process.on("SIGINT", () => {
      console.log("\n👋 Shutting down...");
      child.kill("SIGINT");
      process.exit(0);
    });

    process.on("SIGTERM", () => {
      child.kill("SIGTERM");
      process.exit(0);
    });
  } catch (error) {
    console.error("❌ Error starting dev server:", error);
    process.exit(1);
  }
}

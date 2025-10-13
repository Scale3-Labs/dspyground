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

    // Find the Next.js server directory
    // In production, this should point to the bundled server
    const serverDir = path.join(__dirname, "..", "src");

    // Start Next.js dev server
    const nextBin = path.join(cwd, "node_modules", ".bin", "next");

    // Check if we're running from the package or local dev
    let command: string;
    let args: string[];

    try {
      // Try to find next in the dspyground package
      const packageNextBin = path.join(
        __dirname,
        "..",
        "node_modules",
        ".bin",
        "next"
      );
      await fs.access(packageNextBin);
      command = packageNextBin;
      args = ["dev", "-p", port.toString()];
    } catch {
      // Fall back to npx
      command = "npx";
      args = ["next", "dev", "-p", port.toString()];
    }

    const child = spawn(command, args, {
      cwd: path.join(__dirname, ".."),
      stdio: "inherit",
      env: {
        ...process.env,
        NODE_ENV: "development",
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

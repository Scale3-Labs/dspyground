import { exec, spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function openBrowser(url: string) {
  const platform = process.platform;
  let command: string;

  switch (platform) {
    case "darwin": // macOS
      command = `open "${url}"`;
      break;
    case "win32": // Windows
      command = `start "" "${url}"`;
      break;
    default: // Linux and others
      command = `xdg-open "${url}"`;
      break;
  }

  exec(command, (error) => {
    if (error) {
      console.log(`\n💡 Please open your browser to: ${url}`);
    }
  });
}

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

    // Check for standalone server (production) or src (development)
    const standaloneServer = path.join(
      packageRoot,
      ".next",
      "standalone",
      "work",
      "dspyground",
      "server.js"
    );
    const hasStandalone = await fs
      .access(standaloneServer)
      .then(() => true)
      .catch(() => false);

    const hasSrc = await fs
      .access(path.join(packageRoot, "src"))
      .then(() => true)
      .catch(() => false);

    let command: string;
    let args: string[];
    let workingDir: string;

    if (hasStandalone) {
      // Production mode: run the standalone server
      console.log("🚀 Running production server\n");
      command = "node";
      args = [standaloneServer];
      workingDir = path.dirname(standaloneServer);
    } else if (hasSrc) {
      // Development mode: run next dev (for local development)
      console.log("🔧 Running in development mode\n");
      command = "npx";
      args = ["next", "dev", "-p", port.toString()];
      workingDir = packageRoot;
    } else {
      throw new Error(
        "Could not find Next.js app in dspyground package. Package may be corrupted."
      );
    }

    const child = spawn(command, args, {
      cwd: workingDir,
      stdio: ["inherit", "pipe", "pipe"],
      env: {
        ...process.env,
        NODE_ENV: hasStandalone ? "production" : "development",
        PORT: port.toString(),
        HOSTNAME: "0.0.0.0",
      },
    });

    let browserOpened = false;
    const serverUrl = `http://localhost:${port}`;

    // Monitor stdout for server ready signal and pipe output
    child.stdout?.on("data", (data) => {
      const output = data.toString();
      process.stdout.write(output);

      // Open browser when server is ready
      if (
        !browserOpened &&
        (output.includes("Ready in") ||
          output.includes("started server on") ||
          output.includes("Local:"))
      ) {
        browserOpened = true;
        setTimeout(() => {
          console.log(`\n🌐 Opening browser at ${serverUrl}...\n`);
          openBrowser(serverUrl);
        }, 500);
      }
    });

    // Pipe stderr
    child.stderr?.on("data", (data) => {
      process.stderr.write(data);
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

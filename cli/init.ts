import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function initCommand() {
  try {
    const cwd = process.cwd();
    console.log("🚀 Initializing DSPyGround in:", cwd);

    // Create .dspyground/data directory
    const dataDir = path.join(cwd, ".dspyground", "data");
    await fs.mkdir(dataDir, { recursive: true });
    console.log("✅ Created .dspyground/data directory");

    // Initialize default JSON files
    const defaultFiles = {
      "preferences.json": {
        selectedModel: "openai/gpt-4o-mini",
        isTeachingMode: false,
        useStructuredOutput: false,
        optimizationModel: "openai/gpt-4o-mini",
        reflectionModel: "openai/gpt-4o",
        batchSize: 3,
        numRollouts: 10,
        selectedMetrics: ["accuracy"],
        optimizeStructuredOutput: false,
      },
      "samples.json": {
        groups: [
          {
            id: "default",
            name: "Default Group",
            samples: [],
          },
        ],
        currentGroupId: "default",
      },
      "runs.json": {
        runs: [],
      },
      "schema.json": {
        type: "object",
        properties: {
          response: {
            type: "string",
            description: "The response text",
          },
        },
        required: ["response"],
      },
      "metrics-prompt.json": {
        prompt: "",
      },
      "prompt.md": "You are a helpful AI assistant.",
    };

    for (const [filename, content] of Object.entries(defaultFiles)) {
      const filePath = path.join(dataDir, filename);
      const fileContent =
        typeof content === "string"
          ? content
          : JSON.stringify(content, null, 2);
      await fs.writeFile(filePath, fileContent, "utf-8");
    }
    console.log("✅ Initialized default data files");

    // Copy config template
    const configPath = path.join(cwd, "dspyground.config.ts");
    try {
      await fs.access(configPath);
      console.log("⚠️  dspyground.config.ts already exists, skipping...");
    } catch {
      // Find templates directory relative to CLI dist
      // __dirname is dist/cli, so we need to go up to package root: ../../templates
      const templatePath = path.join(
        __dirname,
        "..",
        "..",
        "templates",
        "dspyground.config.ts.template"
      );
      const templateContent = await fs.readFile(templatePath, "utf-8");
      await fs.writeFile(configPath, templateContent, "utf-8");
      console.log("✅ Created dspyground.config.ts");
    }

    // Update .gitignore
    const gitignorePath = path.join(cwd, ".gitignore");
    try {
      const gitignoreContent = await fs.readFile(gitignorePath, "utf-8");
      if (!gitignoreContent.includes(".dspyground/")) {
        await fs.appendFile(
          gitignorePath,
          "\n# DSPyGround local data\n.dspyground/\n",
          "utf-8"
        );
        console.log("✅ Updated .gitignore");
      }
    } catch {
      // Create .gitignore if it doesn't exist
      await fs.writeFile(
        gitignorePath,
        "# DSPyGround local data\n.dspyground/\n",
        "utf-8"
      );
      console.log("✅ Created .gitignore");
    }

    console.log("\n✨ DSPyGround initialized successfully!\n");
    console.log("Next steps:");
    console.log("1. Set AI_GATEWAY_API_KEY environment variable");
    console.log(
      "   Get your API key: https://vercel.com/docs/ai-gateway/getting-started#set-up-your-api-key"
    );
    console.log("2. Edit dspyground.config.ts to add your tools and prompts");
    console.log("3. Run: npx dspyground dev");
    console.log("\n");
  } catch (error) {
    console.error("❌ Error initializing DSPyGround:", error);
    process.exit(1);
  }
}

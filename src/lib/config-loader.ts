import path from "path";
import { pathToFileURL } from "url";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ToolDefinition = any; // AI SDK tool type - using any to allow user's custom tools

export interface DspygroundConfig {
  tools?: Record<string, ToolDefinition>;
  systemPrompt?: string;
  defaultModel?: string;
}

let cachedConfig: DspygroundConfig | null = null;

export async function loadUserConfig(): Promise<DspygroundConfig> {
  // Return cached config if available
  if (cachedConfig) {
    return cachedConfig;
  }

  const defaultConfig: DspygroundConfig = {
    tools: {},
    systemPrompt: undefined,
    defaultModel: "openai/gpt-4o-mini",
  };

  try {
    // Get the config path from the user's working directory
    const configPath =
      process.env.DSPYGROUND_CONFIG_PATH ||
      path.join(process.cwd(), "dspyground.config.ts");

    console.log("🔍 Looking for config at:", configPath);

    // Try to import the config
    // Use pathToFileURL to handle Windows paths correctly
    const configUrl = pathToFileURL(configPath).href;

    // Dynamic import with cache busting
    const configModule = await import(`${configUrl}?t=${Date.now()}`);
    const userConfig = configModule.default || configModule;

    console.log("✅ Loaded user config successfully");

    // Merge with defaults
    cachedConfig = {
      tools: userConfig.tools || defaultConfig.tools,
      systemPrompt: userConfig.systemPrompt || defaultConfig.systemPrompt,
      defaultModel: userConfig.defaultModel || defaultConfig.defaultModel,
    };

    return cachedConfig;
  } catch (error) {
    console.warn(
      "⚠️  Could not load user config, using defaults:",
      error instanceof Error ? error.message : error
    );
    cachedConfig = defaultConfig;
    return defaultConfig;
  }
}

export function getDataDirectory(): string {
  if (process.env.DSPYGROUND_DATA_DIR) {
    return process.env.DSPYGROUND_DATA_DIR;
  }

  // Check for .dspyground/data (production/user mode)
  const userDataDir = path.join(process.cwd(), ".dspyground", "data");

  // Fallback to data/ for local development in the dspyground repo itself
  const devDataDir = path.join(process.cwd(), "data");

  // Use fs to check if directory exists
  const fs = require("fs");
  if (fs.existsSync(userDataDir)) {
    return userDataDir;
  } else if (fs.existsSync(devDataDir)) {
    console.log("⚠️  Using legacy data/ directory for development");
    return devDataDir;
  }

  // Default to .dspyground/data
  return userDataDir;
}

// Clear cache (useful for testing or hot reload)
export function clearConfigCache() {
  cachedConfig = null;
}

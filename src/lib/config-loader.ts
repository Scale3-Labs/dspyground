import path from "path";
import { z } from "zod";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ToolDefinition = any; // AI SDK tool type - using any to allow user's custom tools

export interface DspygroundConfig {
  tools?: Record<string, ToolDefinition>;
  systemPrompt?: string;
  schema?: z.ZodType<any, any, any>; // Zod schema for structured output (config only)
  // Preferences (config only)
  preferences?: {
    selectedModel?: string;
    isTeachingMode?: boolean;
    useStructuredOutput?: boolean;
    optimizationModel?: string;
    reflectionModel?: string;
    batchSize?: number;
    numRollouts?: number;
    selectedMetrics?: string[];
    optimizeStructuredOutput?: boolean;
  };
  // Metrics evaluation configuration (config only)
  metricsPrompt?: {
    evaluation_instructions?: string;
    dimensions?: Record<
      string,
      {
        name: string;
        description: string;
        weight: number;
      }
    >;
    positive_feedback_instruction?: string;
    negative_feedback_instruction?: string;
    comparison_positive?: string;
    comparison_negative?: string;
  };
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
  };

  try {
    // Get the config path from the user's working directory
    const configPath =
      process.env.DSPYGROUND_CONFIG_PATH ||
      path.join(process.cwd(), "dspyground.config.ts");

    console.log("🔍 Looking for config at:", configPath);

    // Check if file exists
    const fs = await import("fs");
    if (!fs.existsSync(configPath)) {
      console.warn("⚠️  Config file not found, using defaults");
      cachedConfig = defaultConfig;
      return defaultConfig;
    }

    // Use jiti to load TypeScript config
    // jiti can handle both .ts and .js files
    const { createJiti } = await import("jiti");
    // Use the config file's directory as the base path
    // This ensures dependencies are resolved from the user's project, not from the bundled package
    const jiti = createJiti(configPath, {
      interopDefault: true,
    });

    // Temporarily change working directory to the config file's directory
    // This ensures process.cwd() in the config file points to the user's project
    const originalCwd = process.cwd();
    const configDir = path.dirname(configPath);

    let userConfig;
    try {
      process.chdir(configDir);

      // Load the config using jiti
      const configModule = jiti(configPath);
      userConfig = configModule.default || configModule;
    } finally {
      // Always restore the original working directory
      process.chdir(originalCwd);
    }

    console.log("✅ Loaded user config successfully");

    // Merge with defaults
    cachedConfig = {
      tools: userConfig.tools || defaultConfig.tools,
      systemPrompt: userConfig.systemPrompt || defaultConfig.systemPrompt,
      schema: userConfig.schema,
      preferences: userConfig.preferences,
      metricsPrompt: userConfig.metricsPrompt,
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
    console.log("⚠️  Using data/ directory for development");
    return devDataDir;
  }

  // Default to .dspyground/data
  return userDataDir;
}

// Clear cache (useful for testing or hot reload)
export function clearConfigCache() {
  cachedConfig = null;
}

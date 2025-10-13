import path from "path";
import { pathToFileURL } from "url";

export interface DspygroundConfig {
  tools?: Record<string, any>;
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
  return (
    process.env.DSPYGROUND_DATA_DIR ||
    path.join(process.cwd(), ".dspyground", "data")
  );
}

// Clear cache (useful for testing or hot reload)
export function clearConfigCache() {
  cachedConfig = null;
}

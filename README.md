# DSPyground

Optimize ~~Engineer~~ your Prompts for better agent trajectories.

A portable playground for prompt optimization using a modified GEPA (Genetic-Pareto) algorithm with multi-dimensional metrics and real-time feedback. Works seamlessly with your existing AI SDK codebase.

## Quick Start

### Prerequisites
- Node.js 18+
- AI Gateway API key (set `AI_GATEWAY_API_KEY` in your `.env` file)
- An AI SDK project (recommended but not required)

> **Note:** DSPyground bundles all required dependencies. If you already have `ai` and `zod` in your project, it will use your versions to avoid conflicts. Otherwise, it uses its bundled versions.

### Installation & Setup

```bash
# Initialize DSPyground in your project
npx dspyground@latest init

# This creates:
# - .dspyground/data/     (local data storage)
# - dspyground.config.ts  (configuration file)
```

### Configuration

Edit `dspyground.config.ts` to import your tools and customize your setup:

```typescript
import { tool } from 'ai'
import { z } from 'zod'
// Import your existing tools
import { myCustomTool } from './src/lib/tools'

export default {
  // Add your AI SDK tools
  tools: {
    myCustomTool,
    // or define new ones inline
  },

  // Set your system prompt
  systemPrompt: `You are a helpful assistant...`,

  // Choose your default model
  defaultModel: 'openai/gpt-4o-mini'
}
```

### Environment Setup

Create a `.env` file in your project root:

```bash
AI_GATEWAY_API_KEY=your_api_key_here
```

This API key will be used by DSPyGround to access AI models through AI Gateway.

### Start the Dev Server

```bash
npx dspyground dev
```

The app runs at `http://localhost:3000`. No additional services needed—optimization runs entirely in-app.

**Note:** All data is stored locally in `.dspyground/data/` within your project. Add `.dspyground/` to your `.gitignore` (automatically done during init).

## How It Works

DSPyground helps you systematically improve prompts through an iterative teach-optimize-test cycle:

### 1. Teaching Mode: Collect Samples
- **Start with a base prompt** in `.dspyground/data/prompt.md` (editable in UI)
- **Enable Teaching Mode** and chat with the AI to create scenarios
- **Save samples with feedback**: Click the + button to save conversation turns as test samples
  - Give **positive feedback** for good responses (these become reference examples)
  - Give **negative feedback** for bad responses (these guide what to avoid)
- **Organize with Sample Groups**: Create groups like "Tone Tests", "Tool Usage", "Safety Tests"

### 2. Optimization: Modified GEPA Algorithm
Click "Optimize" to start the automated prompt improvement process. Here's what happens:

#### The Modified GEPA Algorithm
Our implementation extends the traditional GEPA (Genetic-Pareto Evolutionary Algorithm) with several key modifications:

**Core Improvements:**
- **Reflection-Based Scoring**: Uses LLM-as-a-judge to evaluate trajectories across multiple dimensions
- **Multi-Metric Optimization**: Tracks 5 dimensions simultaneously (tone, accuracy, efficiency, tool_accuracy, guardrails)
- **Dual Feedback Learning**: Handles both positive examples (reference quality) and negative examples (patterns to avoid)
- **Configurable Metrics**: Customize evaluation dimensions via `data/metrics-prompt.json`
- **Real-Time Streaming**: Watch sample generation and evaluation as they happen

**How It Works:**
1. **Initialization**: Evaluates your seed prompt against a random batch of samples
2. **Iteration Loop** (for N rollouts):
   - Select best prompt from Pareto frontier
   - Sample random batch from your collected samples
   - Generate trajectories using current prompt
   - Evaluate each with reflection model (LLM-as-judge)
   - Synthesize feedback and improve prompt
   - Test improved prompt on same batch
   - Accept if better; update Pareto frontier
3. **Pareto Frontier**: Maintains set of non-dominated solutions across all metrics
4. **Best Selection**: Returns prompt with highest overall score

**Key Differences from Standard GEPA:**
- Evaluates on full conversational trajectories, not just final responses
- Uses structured output (Zod schemas) for consistent metric scoring
- Supports tool-calling agents with efficiency and tool accuracy metrics
- Streams progress for real-time monitoring

### 3. Configuration

**Optimization Settings** (`.dspyground/data/preferences.json`):
- `optimizationModel`: Model used for generating responses during optimization
- `reflectionModel`: Model used for evaluation/judgment (should be more capable)
- `batchSize`: Number of samples per iteration (default: 2)
- `numRollouts`: Number of optimization iterations (default: 3)
- `selectedMetrics`: Which dimensions to optimize for

**Metrics Configuration** (`.dspyground/data/metrics-prompt.json`):
- Customize evaluation instructions and dimension descriptions
- Adjust weights and criteria for each metric
- Define how positive vs negative feedback is interpreted

### 4. Results & History
- **Optimized prompt** saved to `.dspyground/data/prompt.md`
- **Run history** stored in `.dspyground/data/runs.json` with:
  - All candidate prompts (accepted and rejected)
  - Scores and metrics for each iteration
  - Sample IDs used during optimization
  - Pareto frontier evolution
- **View in History tab**: See score progression and prompt evolution

## Features

### Structured Output Mode
Toggle between regular chat and structured output using the switch in the UI.

**JSON Schema Mode:**
- Edit `.dspyground/data/schema.json` to define your output structure
- AI returns responses matching your schema
- Use cases: data extraction, classification, form filling, structured analysis

### Custom Tools
- Import your tools in `dspyground.config.ts`
- All tools from your config are automatically available
- Works with any AI SDK tool from your existing codebase
- Example tools included in the template

### Sample Groups
- Organize samples by use case or test category
- Switch groups during optimization to test different scenarios
- Each group maintains its own set of samples with feedback

## Architecture

**Frontend**: Next.js with AI SDK (`ai` package)
- Real-time streaming with `useChat` and `useObject` hooks
- Server-sent events for optimization progress
- shadcn/ui component library

**Backend**: Next.js API routes
- `/api/chat` - Text and structured chat endpoints
- `/api/optimize` - GEPA optimization with streaming progress
- `/api/samples`, `/api/runs` - Data persistence
- `/api/metrics-prompt` - Configurable metrics

**Optimization Engine**: Hybrid TypeScript + Python implementation
- TypeScript GEPA algorithm in `src/app/api/optimize/route.ts`
- Reflection-based scoring in `src/lib/metrics.ts`

## Local Data Files

All data is stored locally in your project:

- `.dspyground/data/prompt.md` — Current optimized prompt
- `.dspyground/data/runs.json` — Full optimization history with all runs
- `.dspyground/data/samples.json` — Collected samples organized by groups
- `.dspyground/data/metrics-prompt.json` — Configurable evaluation criteria
- `.dspyground/data/schema.json` — JSON schema for structured output mode
- `.dspyground/data/preferences.json` — User preferences and optimization config
- `dspyground.config.ts` — Tools, prompts, and model configuration

## Learn More

**DSPy & GEPA:**
- [DSPy Documentation](https://dspy.ai/) — Prompt optimization framework
- [GEPA Optimizer](https://dspy.ai/api/optimizers/GEPA/) — Genetic-Pareto optimization
- [GEPA Tweet](https://x.com/LakshyAAAgrawal/status/1949867953421496715) — Original announcement
- [GEPA Paper](https://arxiv.org/pdf/2507.19457) — Academic research

**AI SDK:**
- [Vercel AI SDK](https://sdk.vercel.ai/docs) — Streaming and tool calling
- [streamObject](https://sdk.vercel.ai/docs/reference/ai-sdk-core/stream-object) — Structured output

## About
Built by the team that built [Langtrace AI](https://langtrace.ai) and [Zest AI](https://heyzest.ai).

## License
Apache-2.0. See [`LICENSE`](LICENSE).
# DSPyground

An open-source prompt optimization harness powered by [GEPA](https://dspy.ai/api/optimizers/GEPA/overview/). Install directly into your existing [AI SDK](https://ai-sdk.dev/) agent repo, import your tools and prompts for 1:1 environment portability, and align agent behavior through iterative sampling and optimization—delivering an optimized prompt as your final artifact. Built for agentic loops.

## Key Features

- **Bootstrap with a Basic Prompt** — Start with any simple prompt—no complex setup required. DSPyground will help you evolve it into a production-ready system prompt.
- **Port Your Agent Environment** — Use a simple config file to import your existing [AI SDK](https://ai-sdk.dev/) prompts and tools—seamlessly recreate your agent environment for optimization.
- **Multi-Dimensional Metrics** — Optimize across 5 key dimensions: **Tone** (communication style), **Accuracy** (correctness), **Efficiency** (tool usage), **Tool Accuracy** (right tools), and **Guardrails** (safety compliance).

## Quick Start

### Prerequisites

- Node.js 18+
- [AI Gateway API key](https://vercel.com/docs/ai-gateway/getting-started) (create one in the AI Gateway dashboard)

### Installation

```bash
# Using npm
npm install -g dspyground

# Or using pnpm
pnpm add -g dspyground
```

### Setup and Start

```bash
# Initialize DSPyground in your project
npx dspyground init

# Start the dev server
npx dspyground dev
```

The app will open at `http://localhost:3000`.

> **Note:** DSPyground bundles all required dependencies. If you already have `ai` and `zod` in your project, it will use your versions to avoid conflicts. Otherwise, it uses its bundled versions.

### Configuration

Edit `dspyground.config.ts` to import your [AI SDK](https://ai-sdk.dev/) tools and customize your setup:

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

This API key will be used by DSPyground to access AI models through [AI Gateway](https://vercel.com/docs/ai-gateway/getting-started). Follow the [getting started guide](https://vercel.com/docs/ai-gateway/getting-started) to create your API key.

**Note:** All data is stored locally in `.dspyground/data/` within your project. Add `.dspyground/` to your `.gitignore` (automatically done during init).

## How It Works

DSPyground follows a simple 3-step workflow:

### 1. Install and Port Your Agent
Install DSPyground in your repo and import your existing [AI SDK](https://ai-sdk.dev/) tools and prompts for 1:1 environment portability. Use `dspyground.config.ts` to configure your agent environment.

### 2. Chat and Sample Trajectories
Interact with your agent and collect trajectory samples that demonstrate your desired behavior:
- **Start with a base prompt** in `.dspyground/data/prompt.md` (editable in UI)
- **Enable Teaching Mode** and chat with the AI to create scenarios
- **Save samples with feedback**: Click the + button to save conversation turns as test samples
  - Give **positive feedback** for good responses (these become reference examples)
  - Give **negative feedback** for bad responses (these guide what to avoid)
- **Organize with Sample Groups**: Create groups like "Tone Tests", "Tool Usage", "Safety Tests"

### 3. Optimize
Run [GEPA](https://dspy.ai/api/optimizers/GEPA/overview/) optimization to generate a refined prompt aligned with your sampled behaviors. Click "Optimize" to start the automated prompt improvement process.

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

## Additional Features

- **Structured Output Mode** — Toggle between regular chat and structured output. Edit `.dspyground/data/schema.json` to define your output structure for data extraction, classification, and more.
- **Custom Tools** — Import your tools in `dspyground.config.ts`. Works with any [AI SDK](https://ai-sdk.dev/) tool from your existing codebase.
- **Sample Groups** — Organize samples by use case or test category. Switch groups during optimization to test different scenarios.

## Architecture

**Frontend**: Next.js with [AI SDK](https://ai-sdk.dev/) (`ai` package)
- Real-time streaming with `useChat` and `useObject` hooks
- Server-sent events for optimization progress
- shadcn/ui component library

**Backend**: Next.js API routes
- `/api/chat` - Text and structured chat endpoints
- `/api/optimize` - [GEPA](https://dspy.ai/api/optimizers/GEPA/overview/) optimization with streaming progress
- `/api/samples`, `/api/runs` - Data persistence
- `/api/metrics-prompt` - Configurable metrics

**Optimization Engine**: TypeScript implementation
- GEPA algorithm in `src/app/api/optimize/route.ts`
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

**GEPA:**
- [GEPA Optimizer](https://dspy.ai/api/optimizers/GEPA/overview/) — Genetic-Pareto optimization algorithm
- [DSPy Documentation](https://dspy.ai/) — Prompt optimization framework
- [GEPA Paper](https://arxiv.org/pdf/2507.19457) — Academic research

**AI SDK:**
- [AI SDK](https://ai-sdk.dev/) — The AI Toolkit for TypeScript
- [AI SDK Docs](https://ai-sdk.dev/docs) — Streaming, tool calling, and structured output

## About
Built by the team that built [Langtrace AI](https://langtrace.ai) and [Zest AI](https://heyzest.ai).

## License
Apache-2.0. See [`LICENSE`](LICENSE).
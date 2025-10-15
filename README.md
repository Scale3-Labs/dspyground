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

Edit `dspyground.config.ts` to configure your agent environment. All configuration is centralized in this file:

```typescript
import { tool } from 'ai'
import { z } from 'zod'
// Import your existing tools
import { myCustomTool } from './src/lib/tools'

export default {
  // Your AI SDK tools
  tools: {
    myCustomTool,
    // or define new ones inline
  },

  // System prompt for your agent
  systemPrompt: `You are a helpful assistant...`,

  // Optional: Zod schema for structured output mode
  schema: z.object({
    response: z.string(),
    sentiment: z.enum(['positive', 'negative', 'neutral'])
  }),

  // Preferences - optimization and chat settings
  preferences: {
    selectedModel: 'openai/gpt-4o-mini',      // Model for interactive chat
    useStructuredOutput: false,               // Enable structured output in chat
    optimizationModel: 'openai/gpt-4o-mini',  // Model to optimize prompts for
    reflectionModel: 'openai/gpt-4o',         // Model for evaluation (judge)
    batchSize: 3,                             // Samples per iteration
    numRollouts: 10,                          // Number of optimization iterations
    selectedMetrics: ['accuracy'],            // Metrics to optimize for
    optimizeStructuredOutput: false           // Use structured output during optimization
  },

  // Metrics evaluation configuration
  metricsPrompt: {
    evaluation_instructions: 'You are an expert AI evaluator...',
    dimensions: {
      accuracy: {
        name: 'Accuracy',
        description: 'Is the information correct?',
        weight: 1.0
      },
      // Add more dimensions...
    }
  }
}
```

**Configuration automatically reloads** when you modify the file—no server restart needed!

### Environment Setup

Create a `.env` file in your project root:

```bash
AI_GATEWAY_API_KEY=your_api_key_here

# Optional: For voice feedback feature (press & hold space bar in feedback dialog)
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_BASE_URL=https://api.openai.com/v1  # Optional: Custom OpenAI-compatible endpoint
```

The `AI_GATEWAY_API_KEY` will be used by DSPyground to access AI models through [AI Gateway](https://vercel.com/docs/ai-gateway/getting-started). Follow the [getting started guide](https://vercel.com/docs/ai-gateway/getting-started) to create your API key.

**Voice Feedback (Optional):**
- `OPENAI_API_KEY`: Required for voice feedback feature. Allows you to record voice feedback in the evaluation dialog by pressing and holding the space bar. Uses OpenAI's Whisper for transcription.
- `OPENAI_BASE_URL`: Optional. Set this if you want to use a custom OpenAI-compatible endpoint (e.g., Azure OpenAI). Defaults to `https://api.openai.com/v1`.

**Note:** All data is stored locally in `.dspyground/data/` within your project. Add `.dspyground/` to your `.gitignore` (automatically done during init).

## How It Works

DSPyground follows a simple 3-step workflow:

### 1. Install and Port Your Agent
Install DSPyground in your repo and import your existing [AI SDK](https://ai-sdk.dev/) tools and prompts for 1:1 environment portability. Use `dspyground.config.ts` to configure your agent environment.

### 2. Chat and Sample Trajectories
Interact with your agent and collect trajectory samples that demonstrate your desired behavior:
- **Start with your system prompt** defined in `dspyground.config.ts`
- **Chat with the AI** to create different scenarios and test your agent
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

### 4. Results & History
- **Run history** stored in `.dspyground/data/runs.json` with:
  - All candidate prompts (accepted and rejected)
  - Scores and metrics for each iteration
  - Sample IDs used during optimization
  - Pareto frontier evolution
- **View in History tab**: See score progression and prompt evolution
- **Copy optimized prompt** from history and update your `dspyground.config.ts`

## Configuration Reference

All configuration lives in `dspyground.config.ts`:

### Core Settings

- **`tools`**: Your AI SDK tools (imported from your codebase or defined inline)
- **`systemPrompt`**: Base system prompt for your agent (defines agent behavior and personality)

### Optional Settings

- **`schema`**: Zod schema for structured output mode (enables JSON extraction, classification, etc.)

### Preferences

- **`selectedModel`**: Model used for interactive chat/testing in the UI
- **`optimizationModel`**: Model to generate responses during optimization (the model you're optimizing for)
- **`reflectionModel`**: Model for evaluation/judgment (typically more capable, acts as the "critic")
- **`useStructuredOutput`**: Enable structured output in chat interface
- **`optimizeStructuredOutput`**: Use structured output during optimization
- **`batchSize`**: Number of samples per optimization iteration (default: 3)
- **`numRollouts`**: Number of optimization iterations (default: 10)
- **`selectedMetrics`**: Array of metrics to optimize for (e.g., `['accuracy', 'tone']`)

### Metrics Configuration

- **`evaluation_instructions`**: Base instructions for the evaluation LLM
- **`dimensions`**: Define custom evaluation metrics with:
  - `name`: Display name for the metric
  - `description`: What this metric measures
  - `weight`: Importance weight (default: 1.0)
- **`positive_feedback_instruction`**: How to handle positive examples
- **`negative_feedback_instruction`**: How to handle negative examples
- **`comparison_positive`**: Comparison criteria for positive samples
- **`comparison_negative`**: Comparison criteria for negative samples

### Voice Feedback Configuration (Optional)

- **`voiceFeedback.enabled`**: Enable/disable voice feedback feature (default: `true`)
- **`voiceFeedback.transcriptionModel`**: OpenAI Whisper model for transcription (default: `'whisper-1'` — only Whisper supported)
- **`voiceFeedback.extractionModel`**: Model to extract rating and feedback from transcript (default: `'openai/gpt-4o-mini'`)

**Note:** Voice feedback requires `OPENAI_API_KEY` in your `.env` file. Press and hold space bar in the feedback dialog to record voice feedback.

## Additional Features

- **Structured Output Mode** — Define Zod schemas in config for data extraction, classification, and structured responses
- **Custom Tools** — Import any [AI SDK](https://ai-sdk.dev/) tool from your existing codebase
- **Sample Groups** — Organize samples by use case or test category
- **Voice Feedback** — Record voice feedback by pressing and holding space bar in the feedback dialog (requires `OPENAI_API_KEY`)
- **Hot Reload** — Config changes automatically reload without server restart

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

**Configuration:**
- `dspyground.config.ts` — All configuration: tools, prompts, schema, preferences, and metrics

**Runtime Data:**
- `.dspyground/data/runs.json` — Optimization history with all runs and scores
- `.dspyground/data/samples.json` — Collected conversation samples organized by groups

**Note:** Add `.dspyground/` to your `.gitignore` to keep runtime data local (automatically done during init).

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
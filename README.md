# DSPyground

Optimize ~~Engineer~~ your Prompts for better agent trajectories.

## Quick Start

### Prerequisites
- Node.js 18+
- `uv` (Python package/runtime manager)
- OpenAI API key and AI Gateway API key

### Setup & Run
```bash
# Install dependencies
npm install

# Start the web app and the Python optimizer together
npm run dev:all
```

The web app runs at `http://localhost:3000`. The optimizer service runs locally and is started for you.

## Teach Mode: How to Use
0. Start with a base prompt by updating `data/prompt.md`.
1. Enter Teach Mode and provide a scenario (what the AI should do).
2. Chat, then collect ideal samples by selecting your question and the AI's answer.
3. Collect as many samples as you like to cover different cases.
4. Go to the Optimize tab and click Optimize.
5. Watch live optimization in the History tab.
6. The final prompt is saved to `data/prompt.md` and shown in the Prompt tab.
7. Optimization versions are saved in `data/versions` and listed in the History tab.
8. Try the Chat again using the updated prompt from the latest run.

### Custom Tools
- Edit `src/lib/tools.ts` to add or replace tools. It contains placeholder tools; anything you define/export there (using `tool(...)`) is automatically available to the agent in chat and optimization—no extra wiring needed.

### Structured Output Mode
Toggle between regular text streaming (`streamText`) and structured output streaming (`streamObject`) using the switch beside the Teaching Mode button.

**Using JSON Schema:**
- Edit `data/schema.json` to define your desired output structure
- The AI will return responses matching your schema when Structured Output mode is enabled
- Supports nested objects, arrays, and various data types
- Example use cases: data extraction, classification, form filling, structured analysis

**Using Zod Schema (Code):**
For programmatic schema definitions, you can modify the API route to use Zod schemas instead of JSON Schema. See the [AI SDK documentation](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-object) for examples.

## DSPy and GEPA

- **DSPy** provides the optimization framework used by this project.
- **GEPA** (Genetic-Pareto) is a reflective optimizer that evolves prompts using textual feedback and Pareto-based selection.
- A lightweight Python service exposes the optimizer; the web app calls it via `/api/optimize`.
- Artifacts written by optimization:
  - `data/prompt.md` — current optimized prompt
  - `data/complete-optimization.json` — full optimization results and metadata
  - `data/versions/` — versioned optimization runs and histories

Learn more: [DSPy Documentation](https://dspy.ai/) · [GEPA Optimizer](https://dspy.ai/api/optimizers/GEPA/) · [GEPA Tweet](https://x.com/LakshyAAAgrawal/status/1949867953421496715) · [GEPA Paper](https://arxiv.org/pdf/2507.19457)

## About
Built by the team that built [Langtrace AI](https://langtrace.ai) and [Zest AI](https://heyzest.ai).

## License
Apache-2.0. See [`LICENSE`](LICENSE).
# LLM-as-a-Judge Metrics

This document describes the metric functions implemented for evaluating agent trajectories using LLM-as-a-judge methodology.

## Overview

Two primary metrics are implemented for evaluating and optimizing agent behavior:

1. **Accuracy Metric** - Evaluates solution correctness and tool targeting
2. **Efficiency Metric** - Evaluates trajectory efficiency based on steps and tool calls

Both metrics use the AI SDK's `generateObject` with structured outputs for consistent, reliable evaluation.

## Architecture

```
src/lib/metrics.ts              # Core metric functions
src/app/api/metrics/route.ts    # REST API endpoint
src/lib/metrics.example.ts      # Usage examples
```

## Metric 0: Accuracy & Tool Targeting

### Purpose
Compares a predicted agent trajectory against a gold (reference) trajectory to evaluate:
- Whether the final solution is accurate
- Whether correct tools were targeted and used appropriately
- Quality of reasoning and execution

### Function Signature

```typescript
async function evaluateAccuracy(
  goldTrajectory: Trajectory,
  predictedTrajectory: Trajectory
): Promise<AccuracyMetricResult>
```

### Input

```typescript
interface Trajectory {
  id: string;
  timestamp: string;
  messages: Message[];
  feedback?: {
    rating: "positive" | "negative";
    comment?: string;
  };
}

interface Message {
  role: "user" | "assistant" | "tool" | "system";
  content: string | Array<{
    type: "text" | "tool-call" | "tool-result";
    text?: string;
    toolCallId?: string;
    toolName?: string;
    args?: any;
    result?: any;
    isError?: boolean;
  }>;
}
```

### Output

```typescript
interface AccuracyMetricResult {
  score: number;                    // -1 to 1
  is_accurate: boolean;             // True if solution matches
  tool_targeting_correct: boolean;  // True if tools used correctly
  feedback: string;                 // Detailed explanation
  tool_comparison: string;          // Tool usage comparison
}
```

### Scoring Scale

- `1.0`: Perfect match - correct solution with correct tools
- `0.5`: Mostly correct - minor issues or slightly different approach
- `0.0`: Partially correct - some aspects right, others wrong
- `-0.5`: Mostly incorrect - fundamental issues
- `-1.0`: Completely incorrect - wrong solution or tool usage

### Example Usage

```typescript
import { evaluateAccuracy } from '@/lib/metrics';

const result = await evaluateAccuracy(goldTrajectory, predictedTrajectory);

console.log(`Score: ${result.score}`);
console.log(`Accurate: ${result.is_accurate}`);
console.log(`Tool targeting: ${result.tool_targeting_correct}`);
console.log(`Feedback: ${result.feedback}`);
```

## Metric 1: Efficiency Evaluation

### Purpose
Compares two trajectories that reach the **same correct solution**, scoring based on:
- Number of steps (assistant message turns)
- Number of tool calls
- Overall efficiency

### Function Signature

```typescript
async function evaluateEfficiency(
  goldTrajectory: Trajectory,
  predictedTrajectory: Trajectory
): Promise<EfficiencyMetricResult>
```

### Output

```typescript
interface EfficiencyMetricResult {
  score: number;              // Positive = more efficient, negative = less efficient
  predicted_steps: number;    // Steps taken by predicted trajectory
  predicted_tool_calls: number;
  gold_steps: number;         // Steps taken by gold trajectory
  gold_tool_calls: number;
  efficiency_ratio: number;   // Predicted/gold ratio (lower is better)
  feedback: string;           // Detailed explanation
}
```

### Scoring Guidelines

- **Positive score**: Predicted trajectory is MORE efficient (fewer steps/tool calls)
  - `+3`: Significantly more efficient (50%+ reduction)
  - `+2`: Moderately more efficient (30-50% reduction)
  - `+1`: Slightly more efficient (10-30% reduction)
- **Zero score**: Both trajectories are equally efficient
- **Negative score**: Predicted trajectory is LESS efficient (more steps/tool calls)
  - `-1`: Slightly less efficient (10-30% increase)
  - `-2`: Moderately less efficient (30-50% increase)
  - `-3`: Significantly less efficient (50%+ increase)

### Example Usage

```typescript
import { evaluateEfficiency } from '@/lib/metrics';

// Both trajectories must reach the same solution
const result = await evaluateEfficiency(goldTrajectory, predictedTrajectory);

console.log(`Score: ${result.score}`);
console.log(`Gold: ${result.gold_steps} steps, ${result.gold_tool_calls} tool calls`);
console.log(`Predicted: ${result.predicted_steps} steps, ${result.predicted_tool_calls} tool calls`);
console.log(`Efficiency ratio: ${result.efficiency_ratio}`);
console.log(`Feedback: ${result.feedback}`);
```

## API Usage

### Endpoint

`POST /api/metrics`

### Request Format

#### Single Accuracy Evaluation

```json
{
  "metric": "accuracy",
  "goldTrajectory": { ... },
  "predictedTrajectory": { ... }
}
```

#### Single Efficiency Evaluation

```json
{
  "metric": "efficiency",
  "goldTrajectory": { ... },
  "predictedTrajectory": { ... }
}
```

#### Batch Evaluation

```json
{
  "metric": "batch",
  "evaluations": [
    {
      "type": "accuracy",
      "id": "eval-1",
      "goldTrajectory": { ... },
      "predictedTrajectory": { ... }
    },
    {
      "type": "efficiency",
      "id": "eval-2",
      "goldTrajectory": { ... },
      "predictedTrajectory": { ... }
    }
  ]
}
```

### Response Format

#### Single Evaluation

```json
{
  "metric": "accuracy",
  "result": {
    "score": 0.9,
    "is_accurate": true,
    "tool_targeting_correct": true,
    "feedback": "...",
    "tool_comparison": "..."
  }
}
```

#### Batch Evaluation

```json
{
  "metric": "batch",
  "results": [
    {
      "id": "eval-1",
      "type": "accuracy",
      "result": { ... },
      "error": null
    },
    {
      "id": "eval-2",
      "type": "efficiency",
      "result": { ... },
      "error": null
    }
  ]
}
```

## Configuration

### Model Selection

The LLM judge model is configured in `src/lib/metrics.ts`:

```typescript
export const JUDGE_MODEL = "openai/gpt-4o-mini";
```

To use a different model, update this constant:

```typescript
// Options:
export const JUDGE_MODEL = "openai/gpt-4o";           // More accurate, slower
export const JUDGE_MODEL = "openai/gpt-4o-mini";      // Default, balanced
export const JUDGE_MODEL = "openai/gpt-4-turbo";      // Alternative
```

## Integration with Optimization

### Basic Optimization Loop

```typescript
async function optimizeAgentPrompt(
  initialPrompt: string,
  goldTrajectories: Trajectory[],
  maxIterations: number = 10
) {
  let currentPrompt = initialPrompt;
  let bestScore = -Infinity;

  for (let i = 0; i < maxIterations; i++) {
    // 1. Generate predictions with current prompt
    const predictions = await generateTrajectories(currentPrompt, goldTrajectories);

    // 2. Evaluate predictions
    const scores = await Promise.all(
      predictions.map(async (pred, idx) => {
        const accuracy = await evaluateAccuracy(goldTrajectories[idx], pred);
        const efficiency = await evaluateEfficiency(goldTrajectories[idx], pred);
        
        // Weighted combination (70% accuracy, 30% efficiency)
        return {
          combined: accuracy.score * 0.7 + efficiency.score * 0.3,
          accuracy: accuracy.score,
          efficiency: efficiency.score,
          feedback: accuracy.feedback
        };
      })
    );

    // 3. Calculate average score
    const avgScore = scores.reduce((sum, s) => sum + s.combined, 0) / scores.length;

    // 4. If improved, update best
    if (avgScore > bestScore) {
      bestScore = avgScore;
      console.log(`Iteration ${i}: Improved to ${avgScore.toFixed(3)}`);
    }

    // 5. Update prompt based on feedback
    currentPrompt = await updatePrompt(currentPrompt, scores);
  }

  return { prompt: currentPrompt, score: bestScore };
}
```

### Advanced: DSPy-style Optimization

These metrics are designed to work with gradient-free optimization algorithms like:

- **MIPRO** (Multi-prompt Instruction Proposal Optimizer)
- **BootstrapFewShot** with teacher-student
- **BayesianOptimizer** for hyperparameter tuning

Example integration:

```python
# python_optimizer/metrics_client.py
import requests

def evaluate_trajectory(gold, predicted, metric_type="accuracy"):
    response = requests.post(
        "http://localhost:3000/api/metrics",
        json={
            "metric": metric_type,
            "goldTrajectory": gold,
            "predictedTrajectory": predicted
        }
    )
    return response.json()

# Use in DSPy metric function
def trajectory_accuracy_metric(gold, predicted):
    result = evaluate_trajectory(gold, predicted, "accuracy")
    return result["result"]["score"]
```

## Helper Functions

### Extract Trajectory Statistics

```typescript
import { extractTrajectoryStats } from '@/lib/metrics';

const stats = extractTrajectoryStats(trajectory);
console.log(`Steps: ${stats.steps}, Tool calls: ${stats.toolCalls}`);
```

## Best Practices

1. **Gold Trajectory Quality**: Ensure gold trajectories represent ideal behavior
2. **Metric Weights**: Adjust accuracy/efficiency weights based on your goals
3. **Batch Evaluation**: Use batch API for multiple evaluations to improve performance
4. **Error Handling**: Always handle potential LLM failures gracefully
5. **Caching**: Consider caching evaluation results for deterministic optimization

## Testing

Run the example functions:

```typescript
import { 
  exampleAccuracyEvaluation,
  exampleEfficiencyEvaluation,
  exampleOptimizationWorkflow
} from '@/lib/metrics.example';

// Run examples
await exampleAccuracyEvaluation();
await exampleEfficiencyEvaluation();
await exampleOptimizationWorkflow();
```

Or use curl to test the API:

```bash
curl -X POST http://localhost:3000/api/metrics \
  -H "Content-Type: application/json" \
  -d @test-data.json
```

## Limitations

1. **LLM Variance**: Evaluations may vary slightly between runs
2. **Cost**: Each evaluation makes an LLM API call (consider caching)
3. **Speed**: Batch evaluations are faster but still limited by LLM latency
4. **Context Window**: Very long trajectories may exceed model context limits

## Future Enhancements

- [ ] Add support for custom scoring functions
- [ ] Implement evaluation caching
- [ ] Add support for trajectory visualization
- [ ] Create metric dashboard for monitoring
- [ ] Add support for multi-turn conversation evaluation
- [ ] Implement confidence scores for evaluations

## License

Same as the main project.


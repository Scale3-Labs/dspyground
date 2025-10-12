# Metrics Quick Start Guide

## What Was Built

Two LLM-as-a-judge metric functions for evaluating agent trajectories:

1. **Accuracy Metric** - Scores solution correctness and tool targeting (-1 to 1)
2. **Efficiency Metric** - Scores based on steps and tool calls (negative/zero/positive)

## Quick Usage

### 1. Direct Function Calls

```typescript
import { evaluateAccuracy, evaluateEfficiency } from '@/lib/metrics';

// Evaluate accuracy
const accuracyResult = await evaluateAccuracy(goldTrajectory, predictedTrajectory);
console.log(accuracyResult.score); // -1 to 1
console.log(accuracyResult.feedback);

// Evaluate efficiency
const efficiencyResult = await evaluateEfficiency(goldTrajectory, predictedTrajectory);
console.log(efficiencyResult.score); // positive = more efficient
console.log(efficiencyResult.feedback);
```

### 2. REST API

Start your Next.js app:
```bash
npm run dev
```

Then POST to `/api/metrics`:

```bash
curl -X POST http://localhost:3000/api/metrics \
  -H "Content-Type: application/json" \
  -d '{
    "metric": "accuracy",
    "goldTrajectory": { ... },
    "predictedTrajectory": { ... }
  }'
```

### 3. Batch Evaluation

```bash
curl -X POST http://localhost:3000/api/metrics \
  -H "Content-Type: application/json" \
  -d '{
    "metric": "batch",
    "evaluations": [
      {
        "type": "accuracy",
        "id": "eval-1",
        "goldTrajectory": { ... },
        "predictedTrajectory": { ... }
      }
    ]
  }'
```

## Test It

Run the included test script:

```bash
npm run test:metrics
```

This will evaluate sample trajectories and show you how the metrics work.

## Trajectory Format

```typescript
interface Trajectory {
  id: string;
  timestamp: string;
  messages: Message[];  // User, assistant, tool messages
  feedback?: {
    rating: "positive" | "negative";
    comment?: string;
  };
}
```

Messages contain:
- `role`: "user" | "assistant" | "tool"
- `content`: text or array of parts (text, tool-call, tool-result)

## Model Configuration

Change the judge model in `src/lib/metrics.ts`:

```typescript
export const JUDGE_MODEL = "openai/gpt-4o-mini"; // Default
// export const JUDGE_MODEL = "openai/gpt-4o";   // More accurate
```

## Integration with Optimization

Basic optimization loop:

```typescript
for (let i = 0; i < iterations; i++) {
  // 1. Generate predictions
  const predictions = await generateWithPrompt(currentPrompt);
  
  // 2. Evaluate
  const scores = await Promise.all(
    predictions.map(pred => 
      evaluateAccuracy(gold, pred)
    )
  );
  
  // 3. Update prompt based on scores
  currentPrompt = await improvePrompt(currentPrompt, scores);
}
```

## Files Created

```
src/lib/metrics.ts                 # Core metric functions
src/lib/metrics.example.ts         # Detailed examples
src/lib/test-metrics.ts            # Test script
src/app/api/metrics/route.ts       # REST API endpoint
METRICS.md                         # Full documentation
METRICS_QUICKSTART.md             # This file
```

## Next Steps

1. **Test locally**: `npm run test:metrics`
2. **Try the API**: Start dev server and POST to `/api/metrics`
3. **Read examples**: Check `src/lib/metrics.example.ts`
4. **Full docs**: See `METRICS.md` for comprehensive guide

## Common Use Cases

### Use Case 1: Evaluate a Single Prediction

```typescript
const result = await evaluateAccuracy(goldTrajectory, prediction);
if (result.score > 0.8 && result.tool_targeting_correct) {
  console.log("✅ High quality prediction!");
}
```

### Use Case 2: Rank Multiple Predictions

```typescript
const predictions = [pred1, pred2, pred3];
const scores = await Promise.all(
  predictions.map(p => evaluateAccuracy(gold, p))
);
const best = scores.reduce((a, b) => a.score > b.score ? a : b);
```

### Use Case 3: Optimize for Efficiency

```typescript
const efficiencyScores = await Promise.all(
  predictions.map(p => evaluateEfficiency(gold, p))
);
// Positive scores = more efficient than gold
const mostEfficient = efficiencyScores
  .sort((a, b) => b.score - a.score)[0];
```

## Python Integration

Call from Python for optimization:

```python
import requests

def evaluate(gold, predicted):
    resp = requests.post(
        "http://localhost:3000/api/metrics",
        json={
            "metric": "accuracy",
            "goldTrajectory": gold,
            "predictedTrajectory": predicted
        }
    )
    return resp.json()["result"]["score"]
```

## Troubleshooting

**Issue**: "Model not found" error
- **Fix**: Make sure `OPENAI_API_KEY` is set in your `.env.local`

**Issue**: Evaluations are slow
- **Fix**: Use batch API endpoint for multiple evaluations

**Issue**: Scores seem inconsistent
- **Fix**: LLMs have inherent variance; consider running multiple evaluations and averaging

## Support

See `METRICS.md` for comprehensive documentation including:
- Detailed API reference
- Advanced optimization patterns
- Error handling best practices
- Performance optimization tips


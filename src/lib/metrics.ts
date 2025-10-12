import { generateObject } from "ai";
import { z } from "zod";

// Model constant for LLM as a judge
export const JUDGE_MODEL = "openai/gpt-4o-mini";

// Type definitions for trajectories/samples
export interface Message {
  role: "user" | "assistant" | "tool" | "system";
  content:
    | string
    | Array<{
        type: "text" | "tool-call" | "tool-result";
        text?: string;
        toolCallId?: string;
        toolName?: string;
        args?: any;
        result?: any;
        isError?: boolean;
      }>;
}

export interface Trajectory {
  id: string;
  timestamp: string;
  messages: Message[];
  feedback?: {
    rating: "positive" | "negative";
    comment?: string;
  };
}

// Schema for Metric 0: Accuracy and Tool Targeting Evaluation
const AccuracyMetricSchema = z.object({
  score: z
    .number()
    .min(-1)
    .max(1)
    .describe(
      "Score from -1 to 1 indicating accuracy. 1 = perfect match, 0 = partially correct, -1 = completely incorrect"
    ),
  is_accurate: z
    .boolean()
    .describe("Whether the predicted solution matches the gold solution"),
  tool_targeting_correct: z
    .boolean()
    .describe("Whether the correct tools were targeted and used appropriately"),
  feedback: z
    .string()
    .describe(
      "Detailed feedback explaining why the solution is or isn't accurate, and whether tool targeting is correct. Should address: 1) correctness of the final answer, 2) appropriateness of tool selection, 3) any errors or issues in the trajectory"
    ),
  tool_comparison: z
    .string()
    .describe(
      "Comparison of tool usage between gold and predicted trajectories"
    ),
});

export type AccuracyMetricResult = z.infer<typeof AccuracyMetricSchema>;

// Schema for Metric 1: Efficiency Evaluation
const EfficiencyMetricSchema = z.object({
  score: z
    .number()
    .describe(
      "Positive score if predicted is more efficient, negative if less efficient, 0 if equal efficiency. Magnitude indicates degree of difference"
    ),
  predicted_steps: z.number().describe("Number of assistant turns/steps taken"),
  predicted_tool_calls: z.number().describe("Number of tool calls made"),
  gold_steps: z.number().describe("Number of assistant turns/steps in gold"),
  gold_tool_calls: z.number().describe("Number of tool calls in gold"),
  efficiency_ratio: z
    .number()
    .describe(
      "Ratio of predicted efficiency to gold efficiency (lower is better for predicted)"
    ),
  feedback: z
    .string()
    .describe(
      "Explanation of the efficiency comparison, highlighting unnecessary steps or tool calls"
    ),
});

export type EfficiencyMetricResult = z.infer<typeof EfficiencyMetricSchema>;

/**
 * Metric 0: Accuracy and Tool Targeting Evaluation
 * Compares a predicted trajectory against a gold trajectory to assess:
 * - Accuracy of the final solution
 * - Correctness of tool targeting and usage
 */
export async function evaluateAccuracy(
  goldTrajectory: Trajectory,
  predictedTrajectory: Trajectory
): Promise<AccuracyMetricResult> {
  const prompt = `You are an expert evaluator assessing agent trajectories.

TASK: Compare the predicted agent trajectory against the gold (reference) trajectory and evaluate:
1. Whether the final solution is accurate
2. Whether the correct tools were targeted and used appropriately

GOLD TRAJECTORY (Reference):
${JSON.stringify(goldTrajectory, null, 2)}

PREDICTED TRAJECTORY (To Evaluate):
${JSON.stringify(predictedTrajectory, null, 2)}

EVALUATION CRITERIA:
1. ACCURACY: Does the predicted trajectory arrive at the same or equivalent final answer as the gold trajectory?
2. TOOL TARGETING: 
   - Are the same or equivalent tools used?
   - Are tools used in appropriate contexts?
   - Are there any missing or extraneous tool calls?
3. QUALITY: Is the reasoning sound and the execution correct?

Provide a detailed evaluation focusing on:
- Why the solution is or isn't accurate
- Whether tool selection and usage is correct
- Any specific errors or improvements needed`;

  const result = await generateObject({
    model: JUDGE_MODEL,
    schema: AccuracyMetricSchema,
    prompt,
  });

  return result.object;
}

/**
 * Metric 1: Efficiency Evaluation
 * Compares two trajectories that reach the same solution, scoring based on:
 * - Number of steps (assistant turns)
 * - Number of tool calls
 * Returns positive score if predicted is more efficient, negative if less efficient
 */
export async function evaluateEfficiency(
  goldTrajectory: Trajectory,
  predictedTrajectory: Trajectory
): Promise<EfficiencyMetricResult> {
  const prompt = `You are an expert evaluator assessing agent trajectory efficiency.

ASSUMPTION: Both trajectories reach the SAME correct solution.

GOLD TRAJECTORY (Reference):
${JSON.stringify(goldTrajectory, null, 2)}

PREDICTED TRAJECTORY (To Evaluate):
${JSON.stringify(predictedTrajectory, null, 2)}

TASK: Compare the efficiency of both trajectories based on:
1. Number of steps (assistant message turns)
2. Number of tool calls made
3. Overall efficiency in reaching the solution

SCORING GUIDELINES:
- Positive score: Predicted is MORE efficient (fewer steps/tool calls)
- Negative score: Predicted is LESS efficient (more steps/tool calls)
- Zero score: Both are equally efficient
- Magnitude should reflect the degree of difference (e.g., +2 for significantly more efficient, -1 for slightly less efficient)

Count the steps and tool calls carefully, then provide:
1. Exact counts for both trajectories
2. An efficiency ratio
3. A score reflecting the efficiency comparison
4. Feedback explaining which trajectory is more efficient and why`;

  const result = await generateObject({
    model: JUDGE_MODEL,
    schema: EfficiencyMetricSchema,
    prompt,
  });

  return result.object;
}

/**
 * Helper function to extract metrics from a trajectory
 */
export function extractTrajectoryStats(trajectory: Trajectory): {
  steps: number;
  toolCalls: number;
} {
  let steps = 0;
  let toolCalls = 0;

  for (const message of trajectory.messages) {
    if (message.role === "assistant") {
      steps++;
      if (Array.isArray(message.content)) {
        toolCalls += message.content.filter(
          (p) => p.type === "tool-call"
        ).length;
      }
    }
  }

  return { steps, toolCalls };
}

import { generateObject } from "ai";
import { z } from "zod";
import { loadUserConfig } from "./config-loader";

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
        args?: unknown;
        result?: unknown;
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

// Unified Reflection-Based Scoring Schema
export const ReflectionScoreSchema = z.object({
  tone: z
    .number()
    .min(0)
    .max(1)
    .describe(
      "Tone appropriateness (0-1): Does the response match the desired communication style?"
    ),
  accuracy: z
    .number()
    .min(0)
    .max(1)
    .describe(
      "Response accuracy (0-1): Is the information correct and does it properly address the query?"
    ),
  efficiency: z
    .number()
    .min(0)
    .max(1)
    .describe(
      "Efficiency score (0-1): Measures the number of turns (assistant responses) and tool calls. Lower score if the model makes unnecessary tool calls or takes extra turns to reach the solution. Example: calling tool1 when not needed, then realizing tool2 is required = less efficient."
    ),
  tool_accuracy: z
    .number()
    .min(0)
    .max(1)
    .describe(
      "Tool selection correctness (0-1): Were the right tools called at the right time?"
    ),
  guardrails: z
    .number()
    .min(0)
    .max(1)
    .describe(
      "Safety and guardrail compliance (0-1): Does the response follow safety guidelines and constraints?"
    ),
  overall_score: z
    .number()
    .min(0)
    .max(1)
    .describe("Weighted overall score combining all dimensions"),
  detailed_feedback: z
    .string()
    .describe(
      "Detailed analysis explaining the scores and what went well or poorly"
    ),
  suggested_improvements: z
    .string()
    .describe(
      "Specific, actionable suggestions for improving the prompt to address the issues found"
    ),
});

export type ReflectionScore = z.infer<typeof ReflectionScoreSchema>;

/**
 * Load metrics prompts configuration from JSON file
 */
async function loadMetricsPrompts(): Promise<{
  evaluation_instructions: string;
  dimensions: Record<
    string,
    { name: string; description: string; weight: number }
  >;
  positive_feedback_instruction: string;
  negative_feedback_instruction: string;
  comparison_positive: string;
  comparison_negative: string;
}> {
  try {
    // Load from config first
    const config = await loadUserConfig();

    if (config.metricsPrompt) {
      // Use config values, fill in defaults for missing fields
      return {
        evaluation_instructions:
          config.metricsPrompt.evaluation_instructions ||
          "You are an expert AI evaluator. Evaluate the generated agent trajectory.",
        dimensions: config.metricsPrompt.dimensions || {},
        positive_feedback_instruction:
          config.metricsPrompt.positive_feedback_instruction ||
          "This is a POSITIVE example (user approved this response).\\nYour task: Compare the generated trajectory to the gold trajectory.\\nThe generated response should match or exceed the quality of the gold trajectory.",
        negative_feedback_instruction:
          config.metricsPrompt.negative_feedback_instruction ||
          "This is a NEGATIVE example (user rejected this response).\\nYour task: Evaluate the generated trajectory in isolation.\\nThe generated response should AVOID the issues mentioned in the user feedback.",
        comparison_positive:
          config.metricsPrompt.comparison_positive ||
          "Compare the generated trajectory to the gold trajectory. It should be at least as good.",
        comparison_negative:
          config.metricsPrompt.comparison_negative ||
          "Check if the generated trajectory avoids the issues mentioned in the negative feedback.",
      };
    }
  } catch (error) {
    console.error("[Metrics] Failed to load metrics from config:", error);
  }

  // Return defaults if config doesn't have metrics prompt
  return {
    evaluation_instructions:
      "You are an expert AI evaluator. Evaluate the generated agent trajectory.",
    dimensions: {
      tone: {
        name: "Tone",
        description:
          "Does it match the desired communication style? Consider the user feedback about tone.",
        weight: 1.0,
      },
      accuracy: {
        name: "Accuracy",
        description: "Is the information correct and helpful?",
        weight: 1.0,
      },
      efficiency: {
        name: "Efficiency",
        description:
          "Count the number of assistant turns and tool calls. Lower score for unnecessary tool calls or extra turns.",
        weight: 1.0,
      },
      tool_accuracy: {
        name: "Tool Accuracy",
        description: "Were the right tools used appropriately?",
        weight: 1.0,
      },
      guardrails: {
        name: "Guardrails",
        description: "Does it follow safety guidelines and constraints?",
        weight: 1.0,
      },
    },
    positive_feedback_instruction:
      "This is a POSITIVE example (user approved this response).\\nYour task: Compare the generated trajectory to the gold trajectory.\\nThe generated response should match or exceed the quality of the gold trajectory.",
    negative_feedback_instruction:
      "This is a NEGATIVE example (user rejected this response).\\nYour task: Evaluate the generated trajectory in isolation.\\nThe generated response should AVOID the issues mentioned in the user feedback.",
    comparison_positive:
      "Compare the generated trajectory to the gold trajectory. It should be at least as good.",
    comparison_negative:
      "Check if the generated trajectory avoids the issues mentioned in the negative feedback.",
  };
}

/**
 * Judge and score a sample using the reflection model
 * This is the core evaluation function for the redesigned GEPA algorithm
 */
export async function judgeAndScoreSample(
  sample: Trajectory,
  generatedTrajectory: Trajectory,
  reflectionModel: string,
  selectedMetrics: readonly string[]
): Promise<{
  metrics: {
    tone?: number;
    accuracy?: number;
    efficiency?: number;
    tool_accuracy?: number;
    guardrails?: number;
    [key: string]: number | undefined;
  };
  overallScore: number;
  detailedFeedback: string;
  suggestedImprovements: string;
}> {
  // Load metrics prompts configuration
  const config = await loadMetricsPrompts();

  const isPositiveFeedback = sample.feedback?.rating === "positive";
  const feedbackComment = sample.feedback?.comment || "No feedback provided";

  // Build judgment prompt using config
  const comparisonContext = isPositiveFeedback
    ? config.positive_feedback_instruction
    : config.negative_feedback_instruction;

  // Build dimension descriptions from config
  const dimensionDescriptions = Object.entries(config.dimensions)
    .map(
      ([_key, dim], index) =>
        `${index + 1}. **${dim.name}**: ${dim.description}`
    )
    .join("\n");

  const comparisonInstruction = isPositiveFeedback
    ? config.comparison_positive
    : config.comparison_negative;

  const judgmentPrompt = `${config.evaluation_instructions}

CONTEXT:
${comparisonContext}

USER FEEDBACK: "${feedbackComment}"
Feedback Type: ${
    isPositiveFeedback ? "POSITIVE (approved)" : "NEGATIVE (rejected)"
  }

SAMPLE TRAJECTORY (Reference):
${JSON.stringify(sample.messages, null, 2)}

GENERATED TRAJECTORY (To Evaluate):
${JSON.stringify(generatedTrajectory.messages, null, 2)}

EVALUATION DIMENSIONS:
${selectedMetrics.map((m) => `- ${m}`).join("\n")}

Evaluate the generated trajectory across ALL 5 dimensions:
${dimensionDescriptions}

${comparisonInstruction}

Provide scores (0-1), detailed feedback, and specific improvement suggestions for the prompt.`;

  try {
    const result = await generateObject({
      model: reflectionModel,
      schema: ReflectionScoreSchema,
      prompt: judgmentPrompt,
    });

    const score = result.object;

    return {
      metrics: {
        tone: score.tone,
        accuracy: score.accuracy,
        efficiency: score.efficiency,
        tool_accuracy: score.tool_accuracy,
        guardrails: score.guardrails,
      },
      overallScore: score.overall_score,
      detailedFeedback: score.detailed_feedback,
      suggestedImprovements: score.suggested_improvements,
    };
  } catch (error) {
    console.error("[Judge] Error evaluating sample:", error);
    // Return neutral scores on error
    return {
      metrics: {
        tone: 0.5,
        accuracy: 0.5,
        efficiency: 0.5,
        tool_accuracy: 0.5,
        guardrails: 0.5,
      },
      overallScore: 0.5,
      detailedFeedback: `Evaluation failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
      suggestedImprovements:
        "Unable to generate suggestions due to evaluation error.",
    };
  }
}

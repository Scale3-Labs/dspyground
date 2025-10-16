import type { Trajectory } from "./metrics";

// Sample is just a trajectory - they have the same structure
export type Sample = Trajectory;

export interface OptimizerConfig {
  seedPrompt: string;
  trainingSamples: Sample[];
  validationSamples: Sample[];
  optimizationModel: string;
  reflectionModel: string;
  batchSize: number;
  numRollouts: number;
  selectedMetrics: MetricType[];
}

// Available metrics for evaluation
export const AVAILABLE_METRICS = [
  "tone",
  "accuracy",
  "efficiency",
  "tool_accuracy",
  "guardrails",
] as const;

export type MetricType = (typeof AVAILABLE_METRICS)[number];

export const METRIC_LABELS: Record<MetricType, string> = {
  tone: "Tone",
  accuracy: "Accuracy",
  efficiency: "Efficiency",
  tool_accuracy: "Tool Accuracy",
  guardrails: "Guardrails",
};

export const METRIC_DESCRIPTIONS: Record<MetricType, string> = {
  tone: "Evaluates whether the agent's communication style matches user expectations. Considers formality, friendliness, and consistency with desired persona (e.g., professional, casual, empathetic).",
  accuracy:
    "Measures if the information provided is factually correct, relevant, and properly addresses the user's query. Checks for completeness and correctness of the response.",
  efficiency:
    "Tracks the number of assistant turns and tool calls. Penalizes unnecessary steps, redundant tool calls, or taking longer paths to reach the solution. Rewards direct, streamlined responses.",
  tool_accuracy:
    "Assesses whether the agent selected and used the right tools at the right time. Checks for missing tool calls, incorrect tool selection, or improper tool usage patterns.",
  guardrails:
    "Ensures the response adheres to safety guidelines, ethical constraints, and content policies. Verifies the agent stays within acceptable boundaries and doesn't produce harmful content.",
};

export interface MetricScores {
  tone?: number;
  accuracy?: number;
  efficiency?: number;
  tool_accuracy?: number;
  guardrails?: number;
  [key: string]: number | undefined; // Allow other metrics
}

export interface PromptCandidate {
  id: string;
  prompt: string;
  metrics: MetricScores; // Separate scores for each metric
  overallScore: number; // Weighted or primary metric for simple comparisons
  bestForExamples: number[]; // Pareto frontier - indices of examples where this is best
  perExampleMetrics?: MetricScores[]; // Metrics for each validation example
}

export interface IterationResult {
  type:
    | "iteration"
    | "complete"
    | "error"
    | "sample_output"
    | "sample_output_stream"
    | "evaluation_output"
    | "start";
  iteration: number;
  candidatePrompt?: string;
  batchScore?: number;
  validationScore?: number;
  accepted: boolean;
  collectionSize: number;
  bestScore: number;
  message?: string;
  error?: string;
  finalPrompt?: string;
  sampleId?: string;
  content?: string;
}

export interface EvaluationResult {
  sampleId: string;
  metrics: MetricScores;
  overallScore: number; // Primary/weighted score for simple comparisons
  feedback: string;
  predictedTrajectory: Trajectory;
}

export interface BatchEvaluationResult {
  samples: EvaluationResult[];
  averageScore: number;
  failures: Array<{
    sampleId: string;
    input: string;
    goldOutput: string;
    predictedOutput: string;
    feedback: string;
  }>;
}

/**
 * Example usage of LLM-as-a-Judge metrics
 *
 * This file demonstrates how to use the accuracy and efficiency metrics
 * for evaluating agent trajectories in optimization workflows.
 */

import {
  evaluateAccuracy,
  evaluateEfficiency,
  extractTrajectoryStats,
  type AccuracyMetricResult,
  type EfficiencyMetricResult,
  type Trajectory,
} from "./metrics";

// Example trajectories for demonstration

const goldTrajectory: Trajectory = {
  id: "gold-1",
  timestamp: "2025-10-12T10:00:00Z",
  messages: [
    {
      role: "user",
      content:
        "What's the estimated wait time to speak with a human agent about billing?",
    },
    {
      role: "assistant",
      content: [
        {
          type: "tool-call",
          toolCallId: "call_1",
          toolName: "humanAgentWaitTime",
          args: { topic: "billing" },
        },
      ],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "call_1",
          toolName: "humanAgentWaitTime",
          result: "Estimated wait time: 15 minutes.",
        },
      ],
    },
    {
      role: "assistant",
      content:
        "The estimated wait time to speak with a human agent about billing is 15 minutes.",
    },
  ],
  feedback: {
    rating: "positive",
    comment: "Quickly answered my question",
  },
};

const predictedTrajectoryAccurate: Trajectory = {
  id: "predicted-1",
  timestamp: "2025-10-12T10:05:00Z",
  messages: [
    {
      role: "user",
      content:
        "What's the estimated wait time to speak with a human agent about billing?",
    },
    {
      role: "assistant",
      content: [
        {
          type: "tool-call",
          toolCallId: "call_2",
          toolName: "humanAgentWaitTime",
          args: { topic: "billing" },
        },
      ],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "call_2",
          toolName: "humanAgentWaitTime",
          result: "Estimated wait time: 15 minutes.",
        },
      ],
    },
    {
      role: "assistant",
      content:
        "The current wait time for billing support is approximately 15 minutes.",
    },
  ],
};

const predictedTrajectoryInaccurate: Trajectory = {
  id: "predicted-2",
  timestamp: "2025-10-12T10:10:00Z",
  messages: [
    {
      role: "user",
      content:
        "What's the estimated wait time to speak with a human agent about billing?",
    },
    {
      role: "assistant",
      content: [
        {
          type: "tool-call",
          toolCallId: "call_3",
          toolName: "lookupInternalKnowledgeBase",
          args: { query: "wait time for billing" },
        },
      ],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "call_3",
          toolName: "lookupInternalKnowledgeBase",
          result:
            "No information found. Would you like me to find a human to respond to your query?",
        },
      ],
    },
    {
      role: "assistant",
      content:
        "I don't have that information. Let me connect you with someone who can help.",
    },
  ],
};

const predictedTrajectoryInefficient: Trajectory = {
  id: "predicted-3",
  timestamp: "2025-10-12T10:15:00Z",
  messages: [
    {
      role: "user",
      content:
        "What's the estimated wait time to speak with a human agent about billing?",
    },
    {
      role: "assistant",
      content: [
        {
          type: "tool-call",
          toolCallId: "call_4",
          toolName: "lookupInternalKnowledgeBase",
          args: { query: "human agent" },
        },
      ],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "call_4",
          toolName: "lookupInternalKnowledgeBase",
          result:
            "No information found. Would you like me to find a human to respond to your query?",
        },
      ],
    },
    {
      role: "assistant",
      content: [
        {
          type: "tool-call",
          toolCallId: "call_5",
          toolName: "humanAgentWaitTime",
          args: { topic: "billing" },
        },
      ],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "call_5",
          toolName: "humanAgentWaitTime",
          result: "Estimated wait time: 15 minutes.",
        },
      ],
    },
    {
      role: "assistant",
      content:
        "The estimated wait time to speak with a human agent about billing is 15 minutes.",
    },
  ],
};

/**
 * Example 1: Evaluating Accuracy
 * Compare a predicted trajectory against a gold standard
 */
async function exampleAccuracyEvaluation() {
  console.log("=== Accuracy Evaluation Example ===\n");

  // Accurate prediction
  console.log("1. Evaluating accurate trajectory...");
  const accurateResult: AccuracyMetricResult = await evaluateAccuracy(
    goldTrajectory,
    predictedTrajectoryAccurate
  );
  console.log("Result:", JSON.stringify(accurateResult, null, 2));
  console.log("\n");

  // Inaccurate prediction (wrong tool used)
  console.log("2. Evaluating inaccurate trajectory...");
  const inaccurateResult: AccuracyMetricResult = await evaluateAccuracy(
    goldTrajectory,
    predictedTrajectoryInaccurate
  );
  console.log("Result:", JSON.stringify(inaccurateResult, null, 2));
  console.log("\n");
}

/**
 * Example 2: Evaluating Efficiency
 * Compare two trajectories that reach the same solution
 */
async function exampleEfficiencyEvaluation() {
  console.log("=== Efficiency Evaluation Example ===\n");

  // Compare efficient vs inefficient trajectory
  console.log("Evaluating efficiency (gold vs inefficient)...");
  const efficiencyResult: EfficiencyMetricResult = await evaluateEfficiency(
    goldTrajectory,
    predictedTrajectoryInefficient
  );
  console.log("Result:", JSON.stringify(efficiencyResult, null, 2));
  console.log("\n");

  // Extract stats
  const goldStats = extractTrajectoryStats(goldTrajectory);
  const predictedStats = extractTrajectoryStats(predictedTrajectoryInefficient);
  console.log("Gold trajectory stats:", goldStats);
  console.log("Predicted trajectory stats:", predictedStats);
  console.log("\n");
}

/**
 * Example 3: Using the API endpoint
 */
async function exampleAPIUsage() {
  console.log("=== API Usage Examples ===\n");

  // Example 1: Single accuracy evaluation
  const accuracyRequest = {
    metric: "accuracy",
    goldTrajectory,
    predictedTrajectory: predictedTrajectoryAccurate,
  };

  console.log("1. Accuracy API request:");
  console.log(JSON.stringify(accuracyRequest, null, 2));
  console.log("\nPOST to: /api/metrics");
  console.log("\n");

  // Example 2: Single efficiency evaluation
  const efficiencyRequest = {
    metric: "efficiency",
    goldTrajectory,
    predictedTrajectory: predictedTrajectoryInefficient,
  };

  console.log("2. Efficiency API request:");
  console.log(JSON.stringify(efficiencyRequest, null, 2));
  console.log("\nPOST to: /api/metrics");
  console.log("\n");

  // Example 3: Batch evaluation
  const batchRequest = {
    metric: "batch",
    evaluations: [
      {
        type: "accuracy",
        id: "eval-1",
        goldTrajectory,
        predictedTrajectory: predictedTrajectoryAccurate,
      },
      {
        type: "accuracy",
        id: "eval-2",
        goldTrajectory,
        predictedTrajectory: predictedTrajectoryInaccurate,
      },
      {
        type: "efficiency",
        id: "eval-3",
        goldTrajectory,
        predictedTrajectory: predictedTrajectoryInefficient,
      },
    ],
  };

  console.log("3. Batch API request:");
  console.log(JSON.stringify(batchRequest, null, 2));
  console.log("\nPOST to: /api/metrics");
  console.log("\n");
}

/**
 * Example 4: Integration with optimization workflow
 */
async function exampleOptimizationWorkflow() {
  console.log("=== Optimization Workflow Example ===\n");

  // Step 1: Collect multiple predicted trajectories
  const predictions = [
    predictedTrajectoryAccurate,
    predictedTrajectoryInaccurate,
    predictedTrajectoryInefficient,
  ];

  // Step 2: Evaluate all predictions
  const evaluations = await Promise.all(
    predictions.map(async (predicted) => {
      const accuracy = await evaluateAccuracy(goldTrajectory, predicted);
      const efficiency = await evaluateEfficiency(goldTrajectory, predicted);

      return {
        trajectoryId: predicted.id,
        accuracy,
        efficiency,
        // Combined score for optimization
        combinedScore: accuracy.score * 0.7 + efficiency.score * 0.3,
      };
    })
  );

  // Step 3: Rank by combined score
  const ranked = evaluations.sort((a, b) => b.combinedScore - a.combinedScore);

  console.log("Ranked trajectories:");
  ranked.forEach((result, index) => {
    console.log(`${index + 1}. Trajectory ${result.trajectoryId}`);
    console.log(`   Accuracy: ${result.accuracy.score.toFixed(2)}`);
    console.log(`   Efficiency: ${result.efficiency.score.toFixed(2)}`);
    console.log(`   Combined: ${result.combinedScore.toFixed(2)}`);
    console.log();
  });

  // Step 4: Select best trajectory for next iteration
  const best = ranked[0];
  console.log(`Best trajectory: ${best.trajectoryId}`);
  console.log(`Score: ${best.combinedScore.toFixed(2)}`);
}

// Uncomment to run examples:
// exampleAccuracyEvaluation();
// exampleEfficiencyEvaluation();
// exampleAPIUsage();
// exampleOptimizationWorkflow();

export {
  exampleAccuracyEvaluation,
  exampleAPIUsage,
  exampleEfficiencyEvaluation,
  exampleOptimizationWorkflow,
};

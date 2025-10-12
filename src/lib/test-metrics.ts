#!/usr/bin/env tsx
/**
 * Simple test script for metrics
 * Run with: npx tsx src/lib/test-metrics.ts
 */

import {
  evaluateAccuracy,
  evaluateEfficiency,
  extractTrajectoryStats,
  type Trajectory,
} from "./metrics";

// Test data
const goldTrajectory: Trajectory = {
  id: "gold-1",
  timestamp: new Date().toISOString(),
  messages: [
    {
      role: "user",
      content: "What's the wait time for billing support?",
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
        "The estimated wait time for billing support is 15 minutes. Would you like me to connect you?",
    },
  ],
};

const predictedTrajectoryGood: Trajectory = {
  id: "predicted-good",
  timestamp: new Date().toISOString(),
  messages: [
    {
      role: "user",
      content: "What's the wait time for billing support?",
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
        "For billing support, the current wait time is about 15 minutes.",
    },
  ],
};

const predictedTrajectoryBad: Trajectory = {
  id: "predicted-bad",
  timestamp: new Date().toISOString(),
  messages: [
    {
      role: "user",
      content: "What's the wait time for billing support?",
    },
    {
      role: "assistant",
      content:
        "I'm not sure about the wait time. Let me route you to someone who can help.",
    },
  ],
};

async function runTests() {
  console.log("🧪 Testing LLM-as-a-Judge Metrics\n");
  console.log("=".repeat(60));

  try {
    // Test 1: Accuracy - Good prediction
    console.log("\n📊 Test 1: Accuracy Evaluation (Good Prediction)");
    console.log("-".repeat(60));
    const accuracyGood = await evaluateAccuracy(
      goldTrajectory,
      predictedTrajectoryGood
    );
    console.log("✅ Score:", accuracyGood.score);
    console.log("✅ Accurate:", accuracyGood.is_accurate);
    console.log("✅ Tool Targeting:", accuracyGood.tool_targeting_correct);
    console.log(
      "✅ Feedback:",
      accuracyGood.feedback.substring(0, 150) + "..."
    );
    console.log();

    // Test 2: Accuracy - Bad prediction
    console.log("\n📊 Test 2: Accuracy Evaluation (Bad Prediction)");
    console.log("-".repeat(60));
    const accuracyBad = await evaluateAccuracy(
      goldTrajectory,
      predictedTrajectoryBad
    );
    console.log("❌ Score:", accuracyBad.score);
    console.log("❌ Accurate:", accuracyBad.is_accurate);
    console.log("❌ Tool Targeting:", accuracyBad.tool_targeting_correct);
    console.log("❌ Feedback:", accuracyBad.feedback.substring(0, 150) + "...");
    console.log();

    // Test 3: Efficiency
    console.log("\n📊 Test 3: Efficiency Evaluation");
    console.log("-".repeat(60));
    const efficiency = await evaluateEfficiency(
      goldTrajectory,
      predictedTrajectoryGood
    );
    console.log("⚡ Score:", efficiency.score);
    console.log("⚡ Gold steps:", efficiency.gold_steps);
    console.log("⚡ Predicted steps:", efficiency.predicted_steps);
    console.log("⚡ Gold tool calls:", efficiency.gold_tool_calls);
    console.log("⚡ Predicted tool calls:", efficiency.predicted_tool_calls);
    console.log("⚡ Efficiency ratio:", efficiency.efficiency_ratio.toFixed(2));
    console.log("⚡ Feedback:", efficiency.feedback.substring(0, 150) + "...");
    console.log();

    // Test 4: Extract stats
    console.log("\n📊 Test 4: Extract Trajectory Statistics");
    console.log("-".repeat(60));
    const goldStats = extractTrajectoryStats(goldTrajectory);
    const predStats = extractTrajectoryStats(predictedTrajectoryGood);
    console.log("📈 Gold trajectory:", goldStats);
    console.log("📈 Predicted trajectory:", predStats);
    console.log();

    console.log("=".repeat(60));
    console.log("\n✅ All tests completed successfully!\n");
  } catch (error) {
    console.error("\n❌ Test failed:");
    console.error(error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runTests().catch(console.error);
}

export { runTests };

# GEPA Algorithm Specification
## Complete Implementation Guide for Any Programming Language

**Version:** 1.0  
**Date:** October 11, 2025  
**Purpose:** Language-agnostic specification for implementing GEPA (Genetic-Pareto Prompt Evolution)

---

## Table of Contents

1. [Overview](#overview)
2. [Core Concepts](#core-concepts)
3. [Data Structures](#data-structures)
4. [Interfaces & Protocols](#interfaces--protocols)
5. [Initialization Algorithm](#initialization-algorithm)
6. [Main Optimization Loop](#main-optimization-loop)
7. [Reflective Mutation Algorithm](#reflective-mutation-algorithm)
8. [Merge Algorithm](#merge-algorithm)
9. [State Management](#state-management)
10. [Selection Strategies](#selection-strategies)
11. [Stopping Conditions](#stopping-conditions)
12. [Implementation Checklist](#implementation-checklist)

---

## Overview

GEPA is an evolutionary optimization algorithm that improves text components (prompts, instructions, code) through:

1. **Reflective Mutation**: Using LLM-based reflection on execution traces to propose improvements
2. **Pareto-Aware Selection**: Maintaining a population of candidates that excel on different data subsets
3. **Minibatch Screening**: Efficient evaluation through small sample testing before full validation
4. **Optional Merging**: Combining strengths from multiple successful candidates

**Key Innovation**: Unlike traditional optimization, GEPA uses rich textual feedback (execution traces, errors, correct answers) to guide evolution.

---

## Core Concepts

### Candidate (Program)
A mapping from component names to component text values.

```
Candidate = Map<string, string>

Example:
{
  "system_prompt": "You are a helpful assistant...",
  "output_format_instructions": "Format your response as JSON..."
}
```

### Data Instance
A single example from the training/validation set. Type is user-defined and opaque to GEPA.

```
DataInst = any  // User-defined type
```

### Trajectory
Execution trace captured during program evaluation. Contains intermediate states, outputs, errors, etc. Type is user-defined.

```
Trajectory = any  // User-defined type
```

### Rollout Output
The output produced by executing a program on a data instance. Type is user-defined.

```
RolloutOutput = any  // User-defined type
```

### Score
A numeric value where **higher is better**. GEPA uses:
- **Minibatch**: `sum(scores)` for acceptance testing
- **Full validation**: `mean(scores)` for tracking and Pareto fronts

```
Score = number  // float, higher is better
```

### Pareto Frontier
For a validation set with N examples, track the best score achieved for each example independently, plus which candidates achieved those scores.

---

## Data Structures

### 1. GEPAState

The complete optimization state, saved after each iteration for resumability.

```typescript
interface GEPAState<RolloutOutput> {
  // Core program tracking
  programCandidates: Candidate[];           // All candidates discovered
  parentProgramForCandidate: (number | null)[][];  // Parent indices for each candidate
  
  // Validation scores
  programFullScoresValSet: number[];        // Average score on full valset per candidate
  progCandidateValSubscores: number[][];    // Per-example scores [candidateIdx][exampleIdx]
  
  // Pareto frontier tracking
  paretoFrontValset: number[];              // Best score achieved per validation example
  programAtParetoFrontValset: Set<number>[]; // Candidate indices at Pareto front per example
  
  // Component tracking
  listOfNamedPredictors: string[];          // Component names in the candidate
  namedPredictorIdToUpdateNextForProgramCandidate: number[]; // Next component to update per candidate
  
  // Iteration tracking
  i: number;                                // Current iteration (-1 initially)
  numFullDsEvals: number;                   // Number of full dataset evaluations
  totalNumEvals: number;                    // Total number of individual example evaluations
  numMetricCallsByDiscovery: number[];      // Total evals when each candidate was discovered
  
  // Optional output tracking
  bestOutputsValset?: [number, RolloutOutput][][]; // Best outputs per validation example
  
  // Logging
  fullProgramTrace: Record<string, any>[];  // Detailed trace of each iteration
}
```

### 2. EvaluationBatch

Result of evaluating a candidate on a batch of data.

```typescript
interface EvaluationBatch<Trajectory, RolloutOutput> {
  outputs: RolloutOutput[];      // One per example
  scores: number[];              // One per example, higher is better
  trajectories?: Trajectory[];   // Optional, only when capture_traces=true
}
```

### 3. CandidateProposal

A proposed new candidate with metadata.

```typescript
interface CandidateProposal {
  candidate: Candidate;
  parentProgramIds: number[];                // Indices of parent candidates
  
  // Minibatch evaluation info
  subsampleIndices?: number[];               // Which training examples used
  subsampleScoresBefore?: number[];          // Scores of parent on minibatch
  subsampleScoresAfter?: number[];           // Scores of new candidate on minibatch
  
  // Metadata
  tag: string;                               // "reflective_mutation" | "merge"
  metadata?: Record<string, any>;            // Additional logging info
}
```

### 4. ReflectiveDataset

Structured feedback for the reflection LLM.

```typescript
type ReflectiveDataset = Map<string, ReflectiveRecord[]>;

interface ReflectiveRecord {
  Inputs: Record<string, any>;              // Clean view of inputs to component
  "Generated Outputs": Record<string, any> | string;  // What the component produced
  Feedback: string;                          // What went wrong / what's correct
  // Optional additional fields
  [key: string]: any;
}
```

---

## Interfaces & Protocols

### 1. Adapter Interface

The single integration point between GEPA and your system.

```typescript
interface Adapter<DataInst, Trajectory, RolloutOutput> {
  /**
   * Evaluate a candidate on a batch of data.
   * 
   * @param batch - Array of data instances
   * @param candidate - Candidate to evaluate
   * @param captureTraces - If true, must return trajectories
   * @returns Evaluation results
   */
  evaluate(
    batch: DataInst[],
    candidate: Candidate,
    captureTraces: boolean
  ): EvaluationBatch<Trajectory, RolloutOutput>;
  
  /**
   * Build reflective dataset from trajectories.
   * 
   * @param candidate - The candidate that was evaluated
   * @param evalBatch - Evaluation result with trajectories
   * @param componentsToUpdate - Which components need reflection
   * @returns Structured feedback per component
   */
  makeReflectiveDataset(
    candidate: Candidate,
    evalBatch: EvaluationBatch<Trajectory, RolloutOutput>,
    componentsToUpdate: string[]
  ): ReflectiveDataset;
  
  /**
   * Optional: Custom instruction proposal logic.
   * If not provided, GEPA uses default proposal.
   * 
   * @param candidate - Current candidate
   * @param reflectiveDataset - Feedback dataset
   * @param componentsToUpdate - Which components to update
   * @returns New component texts
   */
  proposeNewTexts?(
    candidate: Candidate,
    reflectiveDataset: ReflectiveDataset,
    componentsToUpdate: string[]
  ): Map<string, string>;
}
```

### 2. Language Model Interface

```typescript
interface LanguageModel {
  /**
   * Generate text from a prompt.
   * 
   * @param prompt - Input prompt
   * @returns Generated text
   */
  generate(prompt: string): Promise<string>;
}
```

### 3. Candidate Selector Interface

```typescript
interface CandidateSelector {
  /**
   * Select a candidate index from the population.
   * 
   * @param state - Current GEPA state
   * @returns Index of selected candidate
   */
  selectCandidateIdx(state: GEPAState): number;
}
```

### 4. Component Selector Interface

```typescript
interface ComponentSelector {
  /**
   * Decide which components to update.
   * 
   * @param state - Current GEPA state
   * @param trajectories - Execution traces
   * @param scores - Scores from evaluation
   * @param candidateId - Selected candidate index
   * @param candidate - Selected candidate
   * @returns Array of component names to update
   */
  selectComponents(
    state: GEPAState,
    trajectories: Trajectory[],
    scores: number[],
    candidateId: number,
    candidate: Candidate
  ): string[];
}
```

### 5. Batch Sampler Interface

```typescript
interface BatchSampler {
  /**
   * Sample minibatch indices.
   * 
   * @param datasetSize - Total size of training set
   * @param iteration - Current iteration number
   * @returns Array of indices to sample
   */
  nextMinibatchIndices(datasetSize: number, iteration: number): number[];
}
```

### 6. Stop Condition Interface

```typescript
interface StopCondition {
  /**
   * Check if optimization should stop.
   * 
   * @param state - Current GEPA state
   * @returns True if should stop
   */
  shouldStop(state: GEPAState): boolean;
}
```

---

## Initialization Algorithm

### Algorithm: Initialize GEPA State

```
FUNCTION InitializeGEPAState(
  seedCandidate: Candidate,
  valset: DataInst[],
  adapter: Adapter,
  trackBestOutputs: boolean
) -> GEPAState:

  // 1. Evaluate seed candidate on full validation set
  evalResult = adapter.evaluate(valset, seedCandidate, captureTraces=false)
  
  // 2. Calculate average score
  valsetAvgScore = mean(evalResult.scores)
  
  // 3. Initialize Pareto frontier
  // Each validation example's best score starts at the seed's score
  paretoFrontValset = copy(evalResult.scores)
  
  // Each validation example's Pareto set starts with just candidate 0
  programAtParetoFrontValset = [
    {0},  // Example 0: candidate 0 is best
    {0},  // Example 1: candidate 0 is best
    ...   // One set per validation example
  ]
  
  // 4. Extract component names
  componentNames = keys(seedCandidate)
  
  // 5. Initialize state
  state = {
    programCandidates: [seedCandidate],
    parentProgramForCandidate: [[null]],  // Seed has no parent
    
    programFullScoresValSet: [valsetAvgScore],
    progCandidateValSubscores: [evalResult.scores],
    
    paretoFrontValset: paretoFrontValset,
    programAtParetoFrontValset: programAtParetoFrontValset,
    
    listOfNamedPredictors: componentNames,
    namedPredictorIdToUpdateNextForProgramCandidate: [0],
    
    i: -1,  // Start at -1, will increment to 0 in first iteration
    numFullDsEvals: 1,
    totalNumEvals: length(valset),
    numMetricCallsByDiscovery: [0],
    
    fullProgramTrace: []
  }
  
  // 6. Optional: Track best outputs
  IF trackBestOutputs:
    state.bestOutputsValset = [
      [(0, evalResult.outputs[0])],  // Example 0
      [(0, evalResult.outputs[1])],  // Example 1
      ...
    ]
  
  RETURN state
```

---

## Main Optimization Loop

### Algorithm: GEPA Engine Main Loop

```
FUNCTION RunGEPAOptimization(
  state: GEPAState,
  trainset: DataInst[],
  valset: DataInst[],
  adapter: Adapter,
  reflectiveProposer: ReflectiveMutationProposer,
  mergeProposer: MergeProposer | null,
  stopCondition: StopCondition,
  logger: Logger
) -> GEPAState:

  // Main optimization loop
  WHILE NOT stopCondition.shouldStop(state):
    
    // Increment iteration
    state.i = state.i + 1
    state.fullProgramTrace.append({i: state.i})
    
    TRY:
      // ===== MERGE PHASE (Optional) =====
      IF mergeProposer IS NOT NULL AND mergeProposer.mergeDue():
        proposal = mergeProposer.propose(state)
        
        IF proposal IS NOT NULL:
          // Check acceptance on minibatch
          parentScores = proposal.subsampleScoresBefore
          newScore = sum(proposal.subsampleScoresAfter)
          
          IF newScore >= max(parentScores):
            // ACCEPT: Full evaluation and add to population
            RunFullEvalAndAdd(state, proposal, adapter, valset, logger)
            mergeProposer.recordMergeAttempt(accepted=true)
            CONTINUE  // Skip reflective mutation this iteration
          ELSE:
            // REJECT: Don't count as attempt
            logger.log("Merge rejected: not better than both parents")
            CONTINUE
      
      // ===== REFLECTIVE MUTATION PHASE =====
      proposal = reflectiveProposer.propose(state)
      
      IF proposal IS NULL:
        logger.log("Reflective mutation did not produce a proposal")
        CONTINUE
      
      // Check acceptance on minibatch
      oldSum = sum(proposal.subsampleScoresBefore)
      newSum = sum(proposal.subsampleScoresAfter)
      
      IF newSum <= oldSum:
        // REJECT: No improvement on minibatch
        logger.log("Rejected: new score {newSum} <= old score {oldSum}")
        CONTINUE
      ELSE:
        // ACCEPT: Full evaluation and add to population
        logger.log("Accepted: new score {newSum} > old score {oldSum}")
        RunFullEvalAndAdd(state, proposal, adapter, valset, logger)
        
        // Schedule future merge attempts if merge is enabled
        IF mergeProposer IS NOT NULL:
          mergeProposer.scheduleMerge()
    
    CATCH exception:
      logger.log("Exception during iteration {state.i}: {exception}")
      // Continue to next iteration (graceful degradation)
  
  // Save final state
  state.save()
  RETURN state
```

### Algorithm: Full Evaluation and Add to Population

```
FUNCTION RunFullEvalAndAdd(
  state: GEPAState,
  proposal: CandidateProposal,
  adapter: Adapter,
  valset: DataInst[],
  logger: Logger
) -> (number, number):

  // Record metric calls at discovery
  numMetricCallsByDiscovery = state.totalNumEvals
  
  // 1. Evaluate new candidate on full validation set
  evalResult = adapter.evaluate(valset, proposal.candidate, captureTraces=false)
  valsetScore = mean(evalResult.scores)
  
  // Update metrics
  state.numFullDsEvals = state.numFullDsEvals + 1
  state.totalNumEvals = state.totalNumEvals + length(valset)
  
  // 2. Add to population
  newProgramIdx = length(state.programCandidates)
  state.programCandidates.append(proposal.candidate)
  state.parentProgramForCandidate.append(proposal.parentProgramIds)
  state.numMetricCallsByDiscovery.append(numMetricCallsByDiscovery)
  
  // Copy component update index from parent with highest index
  maxPredictorId = max(
    state.namedPredictorIdToUpdateNextForProgramCandidate[p] 
    FOR p IN proposal.parentProgramIds
  )
  state.namedPredictorIdToUpdateNextForProgramCandidate.append(maxPredictorId)
  
  // 3. Add scores
  state.programFullScoresValSet.append(valsetScore)
  state.progCandidateValSubscores.append(evalResult.scores)
  
  // 4. Update Pareto frontier
  FOR exampleIdx IN range(length(valset)):
    oldBestScore = state.paretoFrontValset[exampleIdx]
    newScore = evalResult.scores[exampleIdx]
    
    IF newScore > oldBestScore:
      // New best for this example
      state.paretoFrontValset[exampleIdx] = newScore
      state.programAtParetoFrontValset[exampleIdx] = {newProgramIdx}
      
      // Update best outputs if tracking
      IF state.bestOutputsValset IS NOT NULL:
        state.bestOutputsValset[exampleIdx] = [
          (newProgramIdx, evalResult.outputs[exampleIdx])
        ]
    
    ELSE IF newScore == oldBestScore:
      // Tied for best
      state.programAtParetoFrontValset[exampleIdx].add(newProgramIdx)
      
      IF state.bestOutputsValset IS NOT NULL:
        state.bestOutputsValset[exampleIdx].append(
          (newProgramIdx, evalResult.outputs[exampleIdx])
        )
  
  // 5. Find linear Pareto front program (overall best)
  linearParetoFrontProgramIdx = argmax(state.programFullScoresValSet)
  
  // 6. Log results
  logger.log("Added candidate {newProgramIdx} with score {valsetScore}")
  IF newProgramIdx == linearParetoFrontProgramIdx:
    logger.log("New candidate is overall best (linear Pareto front)")
  
  RETURN (newProgramIdx, linearParetoFrontProgramIdx)
```

---

## Reflective Mutation Algorithm

### Algorithm: Reflective Mutation Proposer

```
FUNCTION ProposeReflectiveMutation(
  state: GEPAState,
  trainset: DataInst[],
  adapter: Adapter,
  reflectionLLM: LanguageModel,
  candidateSelector: CandidateSelector,
  componentSelector: ComponentSelector,
  batchSampler: BatchSampler,
  perfectScore: number,
  skipPerfectScore: boolean
) -> CandidateProposal | null:

  iteration = state.i + 1
  
  // STEP 1: Select parent candidate
  parentIdx = candidateSelector.selectCandidateIdx(state)
  parentCandidate = state.programCandidates[parentIdx]
  
  logger.log("Selected parent {parentIdx} with score {state.programFullScoresValSet[parentIdx]}")
  
  // STEP 2: Sample minibatch from training set
  minibatchIndices = batchSampler.nextMinibatchIndices(length(trainset), iteration - 1)
  minibatch = [trainset[i] FOR i IN minibatchIndices]
  
  // STEP 3: Evaluate parent with trace capture
  evalParent = adapter.evaluate(minibatch, parentCandidate, captureTraces=true)
  state.totalNumEvals = state.totalNumEvals + length(minibatch)
  
  // Check for trajectories
  IF evalParent.trajectories IS NULL OR length(evalParent.trajectories) == 0:
    logger.log("No trajectories captured, skipping")
    RETURN null
  
  // STEP 4: Check if all perfect (optional early exit)
  IF skipPerfectScore AND all(score >= perfectScore FOR score IN evalParent.scores):
    logger.log("All scores perfect, skipping")
    RETURN null
  
  // STEP 5: Select components to update
  componentsToUpdate = componentSelector.selectComponents(
    state, 
    evalParent.trajectories,
    evalParent.scores,
    parentIdx,
    parentCandidate
  )
  
  // STEP 6: Build reflective dataset
  TRY:
    reflectiveDataset = adapter.makeReflectiveDataset(
      parentCandidate,
      evalParent,
      componentsToUpdate
    )
  CATCH exception:
    logger.log("Exception building reflective dataset: {exception}")
    RETURN null
  
  // STEP 7: Propose new component texts
  TRY:
    // Use adapter's custom proposal if available, else default
    IF adapter.proposeNewTexts IS NOT NULL:
      newTexts = adapter.proposeNewTexts(
        parentCandidate,
        reflectiveDataset,
        componentsToUpdate
      )
    ELSE:
      newTexts = DefaultProposeNewTexts(
        reflectionLLM,
        parentCandidate,
        reflectiveDataset,
        componentsToUpdate
      )
    
    FOR componentName, newText IN newTexts:
      logger.log("Proposed new text for {componentName}: {newText}")
  
  CATCH exception:
    logger.log("Exception proposing new texts: {exception}")
    RETURN null
  
  // STEP 8: Create new candidate
  newCandidate = copy(parentCandidate)
  FOR componentName, newText IN newTexts:
    newCandidate[componentName] = newText
  
  // STEP 9: Evaluate new candidate on same minibatch
  evalNew = adapter.evaluate(minibatch, newCandidate, captureTraces=false)
  state.totalNumEvals = state.totalNumEvals + length(minibatch)
  
  // STEP 10: Create and return proposal
  proposal = {
    candidate: newCandidate,
    parentProgramIds: [parentIdx],
    subsampleIndices: minibatchIndices,
    subsampleScoresBefore: evalParent.scores,
    subsampleScoresAfter: evalNew.scores,
    tag: "reflective_mutation"
  }
  
  RETURN proposal
```

### Algorithm: Default Instruction Proposal

```
FUNCTION DefaultProposeNewTexts(
  reflectionLLM: LanguageModel,
  currentCandidate: Candidate,
  reflectiveDataset: ReflectiveDataset,
  componentsToUpdate: string[]
) -> Map<string, string>:

  newTexts = {}
  
  FOR componentName IN componentsToUpdate:
    currentInstruction = currentCandidate[componentName]
    feedbackRecords = reflectiveDataset[componentName]
    
    // Format feedback records as markdown
    formattedFeedback = FormatReflectiveDatasetAsMarkdown(feedbackRecords)
    
    // Build prompt for reflection LLM
    prompt = """
I provided an assistant with the following instructions to perform a task for me:
```
{currentInstruction}
```

The following are examples of different task inputs provided to the assistant 
along with the assistant's response for each of them, and some feedback on how 
the assistant's response could be better:
```
{formattedFeedback}
```

Your task is to write a new instruction for the assistant.

Read the inputs carefully and identify the input format and infer detailed task 
description about the task I wish to solve with the assistant.

Read all the assistant responses and the corresponding feedback. Identify all 
niche and domain specific factual information about the task and include it in 
the instruction, as a lot of it may not be available to the assistant in the 
future. The assistant may have utilized a generalizable strategy to solve the 
task, if so, include that in the instruction as well.

Provide the new instructions within ``` blocks.
"""
    
    // Call reflection LLM
    response = reflectionLLM.generate(prompt)
    
    // Extract instruction from code blocks
    newInstruction = ExtractTextFromCodeBlocks(response)
    
    newTexts[componentName] = newInstruction
  
  RETURN newTexts
```

### Helper: Format Reflective Dataset as Markdown

```
FUNCTION FormatReflectiveDatasetAsMarkdown(records: ReflectiveRecord[]) -> string:
  
  output = ""
  
  FOR exampleIdx, record IN enumerate(records):
    output += "# Example {exampleIdx + 1}\n"
    
    FOR key, value IN record:
      output += "## {key}\n"
      output += RenderValue(value, level=3)
      output += "\n"
    
    output += "\n"
  
  RETURN output


FUNCTION RenderValue(value: any, level: number) -> string:
  IF value IS object/dict:
    result = ""
    FOR key, val IN value:
      result += "{'#' * level} {key}\n"
      result += RenderValue(val, min(level + 1, 6))
    RETURN result
  
  ELSE IF value IS array/list:
    result = ""
    FOR idx, item IN enumerate(value):
      result += "{'#' * level} Item {idx + 1}\n"
      result += RenderValue(item, min(level + 1, 6))
    RETURN result
  
  ELSE:
    RETURN "{value}\n\n"
```

### Helper: Extract Text from Code Blocks

```
FUNCTION ExtractTextFromCodeBlocks(text: string) -> string:
  // Find first and last triple backticks
  startIdx = text.indexOf("```")
  endIdx = text.lastIndexOf("```")
  
  IF startIdx == -1 OR endIdx == -1 OR startIdx == endIdx:
    // No complete code block, return trimmed text
    RETURN text.trim()
  
  // Extract content between backticks
  content = text.substring(startIdx + 3, endIdx)
  
  // Remove optional language specifier on first line
  IF content.startsWith with language identifier (e.g., "python\n", "typescript\n"):
    firstNewline = content.indexOf("\n")
    IF firstNewline != -1:
      content = content.substring(firstNewline + 1)
  
  RETURN content.trim()
```

---

## Merge Algorithm

### Algorithm: Merge Proposer

```
FUNCTION ProposeMerge(
  state: GEPAState,
  valset: DataInst[],
  adapter: Adapter,
  subsampleSize: number,
  randomGenerator: Random
) -> CandidateProposal | null:

  // STEP 1: Find all candidates in any Pareto set
  paretoPrograms = new Set()
  FOR exampleParetoSet IN state.programAtParetoFrontValset:
    paretoPrograms.addAll(exampleParetoSet)
  
  IF length(paretoPrograms) < 2:
    // Need at least 2 candidates to merge
    RETURN null
  
  // STEP 2: Select 2 random Pareto programs
  paretoList = toArray(paretoPrograms)
  [prog1Idx, prog2Idx] = randomGenerator.sample(paretoList, 2)
  
  prog1 = state.programCandidates[prog1Idx]
  prog2 = state.programCandidates[prog2Idx]
  
  logger.log("Attempting merge of candidates {prog1Idx} and {prog2Idx}")
  
  // STEP 3: Sample subsample from validation set
  subsampleIndices = randomGenerator.sample(range(length(valset)), subsampleSize)
  subsample = [valset[i] FOR i IN subsampleIndices]
  
  // STEP 4: Evaluate both parents on subsample
  eval1 = adapter.evaluate(subsample, prog1, captureTraces=false)
  eval2 = adapter.evaluate(subsample, prog2, captureTraces=false)
  
  state.totalNumEvals = state.totalNumEvals + 2 * length(subsample)
  
  // STEP 5: Create merged candidate
  // Strategy: Combine components using an LLM or simple concatenation
  mergedCandidate = CreateMergedCandidate(prog1, prog2)
  
  // STEP 6: Evaluate merged candidate on subsample
  evalMerged = adapter.evaluate(subsample, mergedCandidate, captureTraces=false)
  state.totalNumEvals = state.totalNumEvals + length(subsample)
  
  // STEP 7: Create proposal
  proposal = {
    candidate: mergedCandidate,
    parentProgramIds: [prog1Idx, prog2Idx],
    subsampleIndices: subsampleIndices,
    subsampleScoresBefore: [sum(eval1.scores), sum(eval2.scores)],
    subsampleScoresAfter: evalMerged.scores,
    tag: "merge"
  }
  
  RETURN proposal
```

### Helper: Create Merged Candidate

```
FUNCTION CreateMergedCandidate(
  candidate1: Candidate,
  candidate2: Candidate
) -> Candidate:

  // Simple merge strategy: concatenate with separator
  merged = {}
  
  FOR componentName IN keys(candidate1):
    text1 = candidate1[componentName]
    text2 = candidate2[componentName]
    
    // Concatenate with clear separation
    merged[componentName] = """
{text1}

---

{text2}
"""
  
  RETURN merged


// Alternative: Use LLM to intelligently merge
FUNCTION CreateMergedCandidateWithLLM(
  candidate1: Candidate,
  candidate2: Candidate,
  mergeLLM: LanguageModel
) -> Candidate:

  merged = {}
  
  FOR componentName IN keys(candidate1):
    text1 = candidate1[componentName]
    text2 = candidate2[componentName]
    
    prompt = """
You are given two instruction sets for the same task. Your goal is to create 
a single, unified instruction that combines the strengths of both.

Instruction Set 1:
```
{text1}
```

Instruction Set 2:
```
{text2}
```

Create a merged instruction that:
1. Includes all important insights from both instructions
2. Removes redundancy
3. Maintains clarity and coherence

Provide the merged instruction within ``` blocks.
"""
    
    response = mergeLLM.generate(prompt)
    merged[componentName] = ExtractTextFromCodeBlocks(response)
  
  RETURN merged
```

---

## State Management

### Algorithm: Save State

```
FUNCTION SaveState(state: GEPAState, runDir: string):
  IF runDir IS NULL:
    RETURN
  
  // Serialize state to binary format (pickle, msgpack, etc.)
  stateFilePath = path.join(runDir, "gepa_state.bin")
  
  // Create directory if it doesn't exist
  createDirectoryIfNotExists(runDir)
  
  // Serialize and save
  serializedState = serialize(state)
  writeFile(stateFilePath, serializedState)
```

### Algorithm: Load State

```
FUNCTION LoadState(runDir: string) -> GEPAState | null:
  stateFilePath = path.join(runDir, "gepa_state.bin")
  
  IF NOT fileExists(stateFilePath):
    RETURN null
  
  // Deserialize state
  serializedState = readFile(stateFilePath)
  state = deserialize(serializedState)
  
  // Validate consistency
  ASSERT length(state.programCandidates) == length(state.programFullScoresValSet)
  ASSERT length(state.paretoFrontValset) == length(state.programAtParetoFrontValset)
  ASSERT length(state.programCandidates) == length(state.parentProgramForCandidate)
  
  RETURN state
```

### Algorithm: State Consistency Check

```
FUNCTION IsStateConsistent(state: GEPAState) -> boolean:
  numCandidates = length(state.programCandidates)
  numValExamples = length(state.paretoFrontValset)
  
  // Check all candidate-level arrays have same length
  IF length(state.programFullScoresValSet) != numCandidates:
    RETURN false
  IF length(state.parentProgramForCandidate) != numCandidates:
    RETURN false
  IF length(state.progCandidateValSubscores) != numCandidates:
    RETURN false
  IF length(state.namedPredictorIdToUpdateNextForProgramCandidate) != numCandidates:
    RETURN false
  IF length(state.numMetricCallsByDiscovery) != numCandidates:
    RETURN false
  
  // Check Pareto frontier arrays have same length
  IF length(state.programAtParetoFrontValset) != numValExamples:
    RETURN false
  
  // Check per-example scores have correct length
  FOR scores IN state.progCandidateValSubscores:
    IF length(scores) != numValExamples:
      RETURN false
  
  // Check Pareto sets reference valid candidate indices
  FOR paretoSet IN state.programAtParetoFrontValset:
    FOR candidateIdx IN paretoSet:
      IF candidateIdx >= numCandidates:
        RETURN false
  
  RETURN true
```

---

## Selection Strategies

### Algorithm: Pareto Candidate Selector

```
FUNCTION ParetoCandidateSelector(state: GEPAState, random: Random) -> number:
  // Collect all candidates that are in any Pareto set
  paretoPrograms = new Set()
  
  FOR exampleIdx IN range(length(state.programAtParetoFrontValset)):
    paretoSet = state.programAtParetoFrontValset[exampleIdx]
    paretoPrograms.addAll(paretoSet)
  
  // Randomly select one
  paretoList = toArray(paretoPrograms)
  selectedIdx = random.choice(paretoList)
  
  RETURN selectedIdx
```

### Algorithm: Current Best Candidate Selector

```
FUNCTION CurrentBestCandidateSelector(state: GEPAState) -> number:
  // Select candidate with highest average validation score
  bestIdx = argmax(state.programFullScoresValSet)
  RETURN bestIdx
```

### Algorithm: Round Robin Component Selector

```
CLASS RoundRobinComponentSelector:
  
  FUNCTION selectComponents(
    state: GEPAState,
    trajectories: Trajectory[],
    scores: number[],
    candidateId: number,
    candidate: Candidate
  ) -> string[]:
    
    // Get next component index to update for this candidate
    componentIdx = state.namedPredictorIdToUpdateNextForProgramCandidate[candidateId]
    componentNames = state.listOfNamedPredictors
    
    // Select the component
    selectedComponent = componentNames[componentIdx]
    
    // Advance to next component (with wraparound)
    nextIdx = (componentIdx + 1) % length(componentNames)
    state.namedPredictorIdToUpdateNextForProgramCandidate[candidateId] = nextIdx
    
    RETURN [selectedComponent]
```

### Algorithm: All Components Selector

```
FUNCTION AllComponentsSelector(
  state: GEPAState,
  trajectories: Trajectory[],
  scores: number[],
  candidateId: number,
  candidate: Candidate
) -> string[]:
  
  // Update all components in every iteration
  RETURN state.listOfNamedPredictors
```

### Algorithm: Epoch Shuffled Batch Sampler

```
CLASS EpochShuffledBatchSampler:
  minibatchSize: number
  random: Random
  currentEpoch: number[]  // Shuffled indices for current epoch
  currentPosition: number
  
  CONSTRUCTOR(minibatchSize: number, random: Random):
    this.minibatchSize = minibatchSize
    this.random = random
    this.currentEpoch = []
    this.currentPosition = 0
  
  FUNCTION nextMinibatchIndices(datasetSize: number, iteration: number) -> number[]:
    // If we need a new epoch
    IF this.currentPosition >= length(this.currentEpoch):
      // Shuffle all indices
      this.currentEpoch = range(datasetSize)
      this.random.shuffle(this.currentEpoch)
      this.currentPosition = 0
    
    // Get next minibatch
    startIdx = this.currentPosition
    endIdx = min(startIdx + this.minibatchSize, length(this.currentEpoch))
    
    minibatch = this.currentEpoch[startIdx:endIdx]
    this.currentPosition = endIdx
    
    // If minibatch is too small, wrap around
    IF length(minibatch) < this.minibatchSize:
      remaining = this.minibatchSize - length(minibatch)
      this.currentEpoch = range(datasetSize)
      this.random.shuffle(this.currentEpoch)
      minibatch.extend(this.currentEpoch[0:remaining])
      this.currentPosition = remaining
    
    RETURN minibatch
```

---

## Stopping Conditions

### Max Metric Calls Stopper

```
CLASS MaxMetricCallsStopper:
  maxMetricCalls: number
  
  CONSTRUCTOR(maxMetricCalls: number):
    this.maxMetricCalls = maxMetricCalls
  
  FUNCTION shouldStop(state: GEPAState) -> boolean:
    RETURN state.totalNumEvals >= this.maxMetricCalls
```

### Perfect Score Stopper

```
CLASS PerfectScoreStopper:
  perfectScore: number
  
  CONSTRUCTOR(perfectScore: number):
    this.perfectScore = perfectScore
  
  FUNCTION shouldStop(state: GEPAState) -> boolean:
    // Check if best candidate achieved perfect score
    IF length(state.programFullScoresValSet) == 0:
      RETURN false
    
    bestScore = max(state.programFullScoresValSet)
    RETURN bestScore >= this.perfectScore
```

### No Improvement Stopper

```
CLASS NoImprovementStopper:
  patience: number  // Number of iterations without improvement
  
  iterationsSinceImprovement: number
  bestScoreSeen: number
  
  CONSTRUCTOR(patience: number):
    this.patience = patience
    this.iterationsSinceImprovement = 0
    this.bestScoreSeen = -Infinity
  
  FUNCTION shouldStop(state: GEPAState) -> boolean:
    IF length(state.programFullScoresValSet) == 0:
      RETURN false
    
    currentBestScore = max(state.programFullScoresValSet)
    
    IF currentBestScore > this.bestScoreSeen:
      // Improvement found
      this.bestScoreSeen = currentBestScore
      this.iterationsSinceImprovement = 0
    ELSE:
      // No improvement
      this.iterationsSinceImprovement += 1
    
    RETURN this.iterationsSinceImprovement >= this.patience
```

### Timeout Stopper

```
CLASS TimeoutStopper:
  maxSeconds: number
  startTime: number
  
  CONSTRUCTOR(maxSeconds: number):
    this.maxSeconds = maxSeconds
    this.startTime = currentTimestamp()
  
  FUNCTION shouldStop(state: GEPAState) -> boolean:
    elapsed = currentTimestamp() - this.startTime
    RETURN elapsed >= this.maxSeconds
```

### File Stopper

```
CLASS FileStopper:
  stopFilePath: string
  
  CONSTRUCTOR(stopFilePath: string):
    this.stopFilePath = stopFilePath
  
  FUNCTION shouldStop(state: GEPAState) -> boolean:
    // Check if stop file exists
    RETURN fileExists(this.stopFilePath)
```

### Composite Stopper

```
CLASS CompositeStopper:
  stoppers: StopCondition[]
  
  CONSTRUCTOR(...stoppers: StopCondition[]):
    this.stoppers = stoppers
  
  FUNCTION shouldStop(state: GEPAState) -> boolean:
    // Stop if ANY stopper returns true (OR logic)
    FOR stopper IN this.stoppers:
      IF stopper.shouldStop(state):
        RETURN true
    
    RETURN false
```

---

## Implementation Checklist

### Phase 1: Core Data Structures ✓
- [ ] Implement `Candidate` type (Map/Dictionary)
- [ ] Implement `GEPAState` class with all fields
- [ ] Implement `EvaluationBatch` type
- [ ] Implement `CandidateProposal` type
- [ ] Implement `ReflectiveDataset` type
- [ ] Add state serialization/deserialization
- [ ] Add state consistency validation

### Phase 2: Interfaces ✓
- [ ] Define `Adapter` interface
- [ ] Define `LanguageModel` interface
- [ ] Define `CandidateSelector` interface
- [ ] Define `ComponentSelector` interface
- [ ] Define `BatchSampler` interface
- [ ] Define `StopCondition` interface
- [ ] Define `Logger` interface

### Phase 3: Selection Strategies ✓
- [ ] Implement `ParetoCandidateSelector`
- [ ] Implement `CurrentBestCandidateSelector`
- [ ] Implement `RoundRobinComponentSelector`
- [ ] Implement `AllComponentsSelector`
- [ ] Implement `EpochShuffledBatchSampler`

### Phase 4: Stopping Conditions ✓
- [ ] Implement `MaxMetricCallsStopper`
- [ ] Implement `PerfectScoreStopper`
- [ ] Implement `NoImprovementStopper`
- [ ] Implement `TimeoutStopper`
- [ ] Implement `FileStopper`
- [ ] Implement `CompositeStopper`

### Phase 5: Core Algorithms ✓
- [ ] Implement `InitializeGEPAState`
- [ ] Implement `RunFullEvalAndAdd`
- [ ] Implement `ProposeReflectiveMutation`
- [ ] Implement `DefaultProposeNewTexts`
- [ ] Implement `FormatReflectiveDatasetAsMarkdown`
- [ ] Implement `ExtractTextFromCodeBlocks`

### Phase 6: Merge Algorithm (Optional) ✓
- [ ] Implement `ProposeMerge`
- [ ] Implement `CreateMergedCandidate`
- [ ] Implement merge scheduling logic

### Phase 7: Main Engine ✓
- [ ] Implement `RunGEPAOptimization` main loop
- [ ] Add exception handling and logging
- [ ] Add progress tracking
- [ ] Add state saving after each iteration

### Phase 8: Simple Adapter Implementation ✓
- [ ] Create a default adapter for single-turn LLM tasks
- [ ] Implement `evaluate` method
- [ ] Implement `makeReflectiveDataset` method
- [ ] Add trajectory capture logic

### Phase 9: Testing ✓
- [ ] Test state initialization
- [ ] Test Pareto frontier updates
- [ ] Test reflective mutation with mock LLM
- [ ] Test acceptance criteria
- [ ] Test state save/load
- [ ] Test stopping conditions
- [ ] End-to-end test on simple task

### Phase 10: Optimization & Production ✓
- [ ] Add async/await support for LLM calls
- [ ] Add caching for LLM responses
- [ ] Add parallel evaluation support
- [ ] Add detailed logging and tracing
- [ ] Add progress bars/UI updates
- [ ] Add experiment tracking integration
- [ ] Performance profiling

---

## Key Implementation Notes

### 1. Score Semantics
- **Higher is always better**
- Minibatch acceptance uses **sum** (not mean) to maintain signal
- Full validation uses **mean** for comparability across dataset sizes
- Ensure your adapter returns scores on a consistent scale

### 2. Pareto Frontier
- Maintained **per validation example**, not globally
- A candidate can be Pareto-optimal for one example even if it's poor overall
- This diversity enables later merging and specialization

### 3. Minibatch Strategy
- Keep minibatch small (3-5 examples typical)
- Must be same minibatch for before/after comparison
- Full validation only for accepted candidates

### 4. Component Granularity
- Can be as fine as single instructions or as coarse as entire programs
- Round-robin works well for independent components
- All-components works when components are tightly coupled

### 5. Reflection Quality
- Use a **strong** model for reflection (GPT-4, Claude 3.5, etc.)
- The task model can be weaker/cheaper
- Reflection is low-volume, high-impact

### 6. State Persistence
- Save state after every iteration
- Enables resumption after crashes
- Track full genealogy for analysis

### 7. Error Handling
- Never let adapter errors kill the optimization loop
- Log exceptions and continue to next iteration
- Graceful degradation is key

### 8. TypeScript-Specific Tips
- Use strict typing for all interfaces
- Consider using `zod` for runtime validation
- Use `async/await` throughout
- Consider using `tiktoken` for token counting
- Use `@anthropic-ai/sdk` or `openai` for LLM calls
- Consider `msgpack` or `protobuf` for state serialization

---

## Example: Minimal TypeScript Skeleton

```typescript
// Core types
type Candidate = Map<string, string>;

interface GEPAState<RolloutOutput> {
  programCandidates: Candidate[];
  programFullScoresValSet: number[];
  paretoFrontValset: number[];
  programAtParetoFrontValset: Set<number>[];
  // ... other fields
}

// Main API
interface GEPAConfig<DataInst, Trajectory, RolloutOutput> {
  seedCandidate: Candidate;
  trainset: DataInst[];
  valset: DataInst[];
  adapter: Adapter<DataInst, Trajectory, RolloutOutput>;
  reflectionLLM: LanguageModel;
  maxMetricCalls: number;
  minibatchSize?: number;
  useMerge?: boolean;
}

async function optimize<DataInst, Trajectory, RolloutOutput>(
  config: GEPAConfig<DataInst, Trajectory, RolloutOutput>
): Promise<GEPAResult> {
  // 1. Initialize state
  const state = await initializeGEPAState(
    config.seedCandidate,
    config.valset,
    config.adapter
  );
  
  // 2. Create proposers
  const reflectiveProposer = new ReflectiveMutationProposer(
    config.trainset,
    config.adapter,
    config.reflectionLLM,
    config.minibatchSize ?? 3
  );
  
  const mergeProposer = config.useMerge 
    ? new MergeProposer(config.valset, config.adapter)
    : null;
  
  // 3. Create stop condition
  const stopCondition = new MaxMetricCallsStopper(config.maxMetricCalls);
  
  // 4. Run optimization loop
  const finalState = await runGEPAOptimization(
    state,
    config.trainset,
    config.valset,
    config.adapter,
    reflectiveProposer,
    mergeProposer,
    stopCondition
  );
  
  // 5. Return result
  return GEPAResult.fromState(finalState);
}

// Usage
const result = await optimize({
  seedCandidate: new Map([
    ["system_prompt", "You are a helpful assistant..."]
  ]),
  trainset: myTrainData,
  valset: myValData,
  adapter: new MyCustomAdapter(),
  reflectionLLM: new OpenAIModel("gpt-4"),
  maxMetricCalls: 150
});

console.log("Best prompt:", result.bestCandidate.get("system_prompt"));
console.log("Best score:", result.bestScore);
```

---

## Conclusion

This specification provides a complete, language-agnostic description of the GEPA algorithm. Key aspects to remember:

1. **Two-level evaluation**: Cheap minibatch, expensive full validation
2. **Pareto-aware**: Maintain diversity through per-example tracking
3. **Reflection-driven**: Use LLM to analyze failures and propose fixes
4. **Stateful & resumable**: Save everything for crash recovery
5. **Modular & extensible**: Clean interfaces for customization

Follow the implementation checklist systematically, starting with data structures and building up to the full optimization loop. Test each component independently before integration.

Good luck with your TypeScript implementation! 🚀


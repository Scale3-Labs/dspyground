from __future__ import annotations

import json
import logging
import os
import time
from pathlib import Path
from typing import Any, Dict, List

# GEPA standalone module
# pylint: disable=import-error
import gepa
from flask import Flask, jsonify, request
from openai import OpenAI

app = Flask(__name__)

# Ensure library logs are emitted at INFO
logging.basicConfig(level=logging.INFO)
logging.getLogger().setLevel(logging.INFO)

# API Configuration
API_KEY = (
    os.getenv("AI_GATEWAY_API_KEY") or os.getenv("AI_GATEWAY_API_KEY")
)
MAIN_MODEL = os.getenv("GEPA_MODEL", "openai/gpt-4.1-mini")
REFLECTION_MODEL = os.getenv(
    "GEPA_REFLECTION_MODEL", "openai/gpt-4.1"
)
JUDGE_LM = "google/gemini-2.5-flash"

# Initialize OpenAI client for LLM-as-a-judge
openai_client = OpenAI(
    api_key=API_KEY, base_url="https://ai-gateway.vercel.sh/v1"
)


def build_metric():
    """Build metric function for GEPA optimization.

    Returns a function that evaluates predictions using LLM-as-judge.
    For reflection calls, returns a dict with {score, feedback}.
    For regular evaluation, returns a float score.
    """

    def metric(
        example: Dict[str, Any], prediction: Any, trace: Any = None
    ) -> Any:
        """Metric function compatible with gepa.optimize().

        Args:
            example: Dict with expected response
            prediction: The generated response
            trace: Optional execution trace

        Returns:
            float score or dict with {score, feedback}
        """
        # Extract expected response from example
        gold_text = example.get("expectedTurnResponse", "")

        # Extract prediction text
        if isinstance(prediction, str):
            pred_text = prediction
        elif isinstance(prediction, dict):
            pred_text = (
                prediction.get("response", "")
                or prediction.get("answer", "")
            )
        else:
            pred_text = str(prediction)

        # Handle missing text cases
        if not gold_text or not pred_text:
            feedback = "Missing gold or predicted text."
            if trace is not None and isinstance(trace, dict):
                return {"score": 0.0, "feedback": feedback}
            return 0.0

        # Use LLM as a judge to evaluate prediction quality
        try:
            judge_prompt = f"""You are an expert evaluator. \
Compare the predicted response against the expected (gold) response.

Expected Response:
{gold_text}

Predicted Response:
{pred_text}

Evaluate how well the predicted response matches the expected \
response in terms of:
1. Semantic similarity and meaning
2. Completeness of information
3. Accuracy of content

Provide a score from 0.0 to 1.0, where:
- 1.0 = Perfect match or equivalent meaning
- 0.7-0.9 = Good match with minor differences
- 0.4-0.6 = Partial match with some key information
- 0.0-0.3 = Poor match or significant differences

Respond in JSON format with exactly these fields:
{{"score": <float between 0 and 1>, \
"feedback": "<brief explanation>"}}"""

            response = openai_client.chat.completions.create(
                model=JUDGE_LM,
                messages=[{"role": "user", "content": judge_prompt}],
                temperature=0.0,
                response_format={"type": "json_object"},
            )

            result = json.loads(response.choices[0].message.content)
            score = float(result.get("score", 0.0))
            feedback = result.get("feedback", "No feedback provided")

            # Clamp score to [0, 1]
            score = max(0.0, min(1.0, score))

        except Exception as e:
            # Fallback to simple token overlap if LLM judge fails
            g = set(gold_text.lower().split())
            p = set(pred_text.lower().split())
            overlap = len(g & p) if g else 0
            score = (overlap / len(g)) if g else 0.0
            feedback = f"LLM judge failed, using token overlap: {e}"

        # For reflection calls, return dict
        if trace is not None and isinstance(trace, dict):
            return {"score": float(score), "feedback": feedback}

        # For regular evaluation, return float
            return float(score)

    return metric


@app.get("/health")
def health() -> Any:
    return jsonify({"status": "ok"})


@app.post("/optimize")
def optimize_endpoint() -> Any:
    """Optimize chat assistant prompts using GEPA."""
    payload = request.get_json(force=True) or {}
    examples_input: List[Dict[str, Any]] = payload.get("examples", [])
    max_metric_calls: int = int(payload.get("maxMetricCalls", 50))

    # GEPA configuration
    auto_mode = payload.get("auto", "light")

    # Model configuration
    main_model = payload.get("mainModel", MAIN_MODEL)
    reflection_model = payload.get("reflectionModel", REFLECTION_MODEL)

    # Streaming trace configuration
    run_id = payload.get("runId")
    trace_dir = payload.get("traceDir")
    trace_path: Path | None = None
    if isinstance(trace_dir, str) and trace_dir.strip():
        try:
            trace_path = Path(trace_dir).joinpath("trace.jsonl")
            trace_path.parent.mkdir(parents=True, exist_ok=True)
        except Exception:
            trace_path = None

    # Prepare trainset (GEPA expects list of dicts)
    trainset: List[Dict[str, Any]] = []
    for ex in examples_input:
        trainset.append(
            {
                "conversationContext": ex.get("conversationContext", ""),
                "expectedTurnResponse": ex.get(
                    "expectedTurnResponse", ""
                ),
            }
        )

    # Build metric
    metric = build_metric()

    # Seed candidate: load initial prompt from prompt.md
    prompt_file = Path(__file__).parent.parent / "data" / "prompt.md"
    try:
        with prompt_file.open("r", encoding="utf-8") as f:
            initial_prompt = f.read().strip()
    except Exception:
        # Fallback to default prompt if file doesn't exist
        initial_prompt = (
            "Given the conversation so far, produce the next "
            "assistant message.\n\n"
            "Optimize for clear, helpful continuation that improves "
            "the chat trajectory.\n"
            "Learn from ideal examples; mirror their structure, tone, "
            "and tool usage."
        )

    seed_candidate = {"system_prompt": initial_prompt}

    # Run GEPA optimization
    start = time.time()

    try:
        # Call gepa.optimize() directly
        gepa_result = gepa.optimize(
            seed_candidate=seed_candidate,
            trainset=trainset,
            valset=trainset,  # Use trainset as valset for now
            task_lm=main_model,
            reflection_lm=reflection_model,
            metric=metric,
            max_metric_calls=max_metric_calls,
            auto=auto_mode if auto_mode != "off" else None,
            api_key=API_KEY,
            base_url="https://ai-gateway.vercel.sh/v1",
        )

        # Extract optimized prompt
        instruction = gepa_result.best_candidate.get("system_prompt", "")
        best_score = (
            gepa_result.best_score
            if hasattr(gepa_result, "best_score")
            else 0.0
        )

    except Exception as e:
        logging.error("GEPA optimization failed: %s", e)
        return (
            jsonify(
                {
                    "error": str(e),
                    "bestScore": 0.0,
                }
            ),
            500,
        )

    # Build result
    optimized_program: Dict[str, Any] = {
        "bestScore": best_score,
        "instruction": instruction,
        "demos": [],
        "examples": examples_input,
        "optimizerType": "GEPA",
        "optimizationTime": int((time.time() - start) * 1000),
        "totalRounds": None,
        "converged": None,
        "stats": None,
    }

    result: Dict[str, Any] = {
        "bestScore": optimized_program["bestScore"],
        "optimizedProgram": optimized_program,
        "stats": optimized_program.get("stats"),
    }

    # Best-effort write a final event for clients tailing the trace
    if trace_path is not None:
        try:
            final_event = {
                "type": "final",
                "runId": run_id,
                "timestamp": time.strftime(
                    "%Y-%m-%dT%H:%M:%SZ", time.gmtime()
                ),
                "bestSoFar": optimized_program["bestScore"],
            }
            with trace_path.open("a", encoding="utf-8") as f:
                f.write(json.dumps(final_event) + "\n")
        except Exception:
            pass

    return jsonify(result)


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    app.run(host="0.0.0.0", port=port)

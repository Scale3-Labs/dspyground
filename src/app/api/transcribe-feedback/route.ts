import { loadUserConfig } from "@/lib/config-loader";
import { createOpenAI, openai } from "@ai-sdk/openai";
import { generateObject, experimental_transcribe as transcribe } from "ai";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// Schema for extracting feedback from transcribed text
const FeedbackExtractionSchema = z.object({
  rating: z
    .enum(["positive", "negative"])
    .describe("Whether the feedback is good (positive) or bad (negative)"),
  comment: z.string().optional().describe("The user's feedback comment"),
});

export async function POST(request: NextRequest) {
  try {
    // Check if OPENAI_API_KEY is set
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        {
          error: "OPENAI_API_KEY not configured",
          message:
            "Voice feedback requires OPENAI_API_KEY environment variable to be set. Please add it to your .env file.",
        },
        { status: 400 }
      );
    }

    // Load config to get voice feedback settings
    const config = await loadUserConfig();
    const voiceConfig = config.voiceFeedback || {
      enabled: true,
      transcriptionModel: "whisper-1",
      extractionModel: "openai/gpt-4o-mini",
    };

    // Check if voice feedback is enabled
    if (voiceConfig.enabled === false) {
      return NextResponse.json(
        {
          error: "Voice feedback is disabled",
          message:
            "Voice feedback is disabled in your dspyground.config.ts. Set voiceFeedback.enabled to true to enable it.",
        },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const audioFile = formData.get("audio") as File;

    if (!audioFile) {
      return NextResponse.json(
        { error: "No audio file provided" },
        { status: 400 }
      );
    }

    // Convert File to Buffer
    const arrayBuffer = await audioFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Step 1: Transcribe the audio directly from buffer
    // Note: Only OpenAI Whisper is supported for transcription
    const { text: transcript } = await transcribe({
      model: openai.transcription(
        voiceConfig.transcriptionModel || "whisper-1"
      ),
      audio: buffer,
    });

    console.log("[Transcribe Feedback] Transcript:", transcript);

    // Step 2: Extract structured feedback from transcript
    const extractionModel = voiceConfig.extractionModel || "openai/gpt-4o-mini";

    // Parse model string (format: provider/model-name)
    const [provider, modelName] = extractionModel.split("/");
    let modelInstance;

    if (provider === "openai") {
      modelInstance = openai(modelName);
    } else {
      // Fallback to creating a custom OpenAI instance
      const customOpenAI = createOpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        baseURL: process.env.OPENAI_BASE_URL,
      });
      modelInstance = customOpenAI(modelName);
    }

    const result = await generateObject({
      model: modelInstance,
      schema: FeedbackExtractionSchema,
      prompt: `You are analyzing user feedback about an AI conversation. The user has provided spoken feedback which has been transcribed.

Extract the following information from the transcript:
1. Whether the feedback is positive (good) or negative (bad)
2. The specific feedback comment

Transcript: "${transcript}"

Determine if the user is expressing positive or negative sentiment, and extract their main feedback points.`,
    });

    console.log("[Transcribe Feedback] Extracted:", result.object);

    return NextResponse.json({
      transcript,
      feedback: result.object,
    });
  } catch (error) {
    console.error("[Transcribe Feedback] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to transcribe and extract feedback",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

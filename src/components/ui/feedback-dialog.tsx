"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Mic, ThumbsDown, ThumbsUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (feedback: {
    rating: "positive" | "negative";
    comment?: string;
  }) => void;
  isSaving?: boolean;
}

export function FeedbackDialog({
  open,
  onOpenChange,
  onSave,
  isSaving = false,
}: FeedbackDialogProps) {
  const [rating, setRating] = useState<"positive" | "negative" | null>(null);
  const [comment, setComment] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const handleSave = () => {
    if (!rating) return;
    onSave({
      rating,
      comment: comment.trim() || undefined,
    });
    // Reset state
    setRating(null);
    setComment("");
  };

  const handleCancel = () => {
    setRating(null);
    setComment("");
    onOpenChange(false);
  };

  // Start voice recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);

      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Stop all tracks
        stream.getTracks().forEach((track) => track.stop());

        // Process the recorded audio
        await processRecording();
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
      toast.info("Recording... Release space bar when done");
    } catch (error) {
      console.error("Error starting recording:", error);
      toast.error(
        "Failed to start recording. Please check microphone permissions."
      );
    }
  };

  // Stop voice recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // Process the recorded audio
  const processRecording = async () => {
    if (audioChunksRef.current.length === 0) return;

    setIsProcessing(true);
    try {
      // Create audio blob
      const audioBlob = new Blob(audioChunksRef.current, { type: "audio/mp3" });

      // Send to API for transcription and extraction
      const formData = new FormData();
      formData.append("audio", audioBlob, "audio.mp3");

      const response = await fetch("/api/transcribe-feedback", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        // Show specific error message from API
        if (data.error === "OPENAI_API_KEY not configured") {
          toast.error(
            "Voice feedback requires OPENAI_API_KEY. Please add it to your .env file.",
            { duration: 5000 }
          );
        } else if (data.error === "Voice feedback is disabled") {
          toast.error("Voice feedback is disabled in your config.", {
            duration: 4000,
          });
        } else {
          toast.error(data.message || "Failed to process audio");
        }
        return;
      }

      // Update the form with extracted feedback
      if (data.feedback) {
        setRating(data.feedback.rating);
        if (data.feedback.comment) {
          setComment(data.feedback.comment);
        }
        toast.success("Voice feedback processed!");
      }
    } catch (error) {
      console.error("Error processing recording:", error);
      toast.error("Failed to process voice feedback");
    } finally {
      setIsProcessing(false);
      audioChunksRef.current = [];
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Space bar: start recording (only if not already recording and not focused on textarea)
      if (e.code === "Space" && !isRecording && !isProcessing) {
        const target = e.target as HTMLElement;
        // Don't trigger if user is typing in textarea
        if (target.tagName !== "TEXTAREA") {
          e.preventDefault();
          startRecording();
        }
      }

      // Enter/Return: save (only if rating is set and not currently processing)
      if (
        e.key === "Enter" &&
        rating &&
        !isSaving &&
        !isRecording &&
        !isProcessing
      ) {
        const target = e.target as HTMLElement;
        // Don't trigger if user is typing in textarea (allow newlines)
        if (target.tagName !== "TEXTAREA") {
          e.preventDefault();
          handleSave();
        }
      }

      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const modifierKey = isMac ? e.metaKey : e.ctrlKey;

      // Cmd/Ctrl + S to save
      if (e.key === "s" && modifierKey && rating) {
        e.preventDefault();
        handleSave();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // Space bar: stop recording
      if (e.code === "Space" && isRecording) {
        e.preventDefault();
        stopRecording();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [open, rating, comment, isRecording, isProcessing, isSaving]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Save Sample with Feedback</DialogTitle>
          <DialogDescription>
            Rate this conversation and optionally add feedback to improve future
            responses.{" "}
            <span className="text-xs text-muted-foreground">
              Tip: Press and hold{" "}
              <kbd className="px-1.5 py-0.5 text-xs font-semibold bg-muted rounded">
                Space
              </kbd>{" "}
              to record voice feedback, press{" "}
              <kbd className="px-1.5 py-0.5 text-xs font-semibold bg-muted rounded">
                Enter
              </kbd>{" "}
              to save
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Rating buttons */}
          <div className="flex items-center justify-center gap-4">
            <Button
              type="button"
              variant={rating === "positive" ? "default" : "outline"}
              size="lg"
              onClick={() => setRating("positive")}
              data-feedback="positive"
              className={cn(
                "flex flex-col items-center gap-2 h-auto py-4 px-8",
                rating === "positive" &&
                  "bg-green-600 hover:bg-green-700 text-white"
              )}
            >
              <ThumbsUp className="size-8" />
              <span className="text-sm font-medium">Good</span>
            </Button>

            <Button
              type="button"
              variant={rating === "negative" ? "default" : "outline"}
              size="lg"
              onClick={() => setRating("negative")}
              data-feedback="negative"
              className={cn(
                "flex flex-col items-center gap-2 h-auto py-4 px-8",
                rating === "negative" &&
                  "bg-red-600 hover:bg-red-700 text-white"
              )}
            >
              <ThumbsDown className="size-8" />
              <span className="text-sm font-medium">Bad</span>
            </Button>
          </div>

          {/* Optional comment field */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label
                htmlFor="feedback-comment"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Additional Feedback (Optional)
              </label>
              {(isRecording || isProcessing) && (
                <div className="flex items-center gap-2 text-xs">
                  {isRecording && (
                    <>
                      <Mic className="size-4 text-red-500 animate-pulse" />
                      <span className="text-red-500 font-medium">
                        Recording...
                      </span>
                    </>
                  )}
                  {isProcessing && (
                    <span className="text-blue-500 font-medium">
                      Processing...
                    </span>
                  )}
                </div>
              )}
            </div>
            <Textarea
              id="feedback-comment"
              placeholder="What made this response good or bad? Any specific improvements you'd like to see?"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="min-h-[100px]"
              disabled={isRecording || isProcessing}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={isSaving || isRecording || isProcessing}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={!rating || isSaving || isRecording || isProcessing}
          >
            {isSaving ? "Saving..." : "Save Sample"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

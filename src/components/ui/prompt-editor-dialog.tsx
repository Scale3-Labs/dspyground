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
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface PromptEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PromptEditorDialog({
  open,
  onOpenChange,
}: PromptEditorDialogProps) {
  const [prompt, setPrompt] = useState("");
  const [originalPrompt, setOriginalPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Load prompt when dialog opens
  useEffect(() => {
    if (open) {
      loadPrompt();
    }
  }, [open]);

  const loadPrompt = async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/prompt");
      if (res.ok) {
        const data = await res.json();
        setPrompt(data.prompt || "");
        setOriginalPrompt(data.prompt || "");
      } else {
        throw new Error("Failed to load prompt");
      }
    } catch (error) {
      console.error("Error loading prompt:", error);
      toast.error("Failed to load prompt");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      const res = await fetch("/api/prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      if (!res.ok) {
        throw new Error("Failed to save prompt");
      }

      setOriginalPrompt(prompt);
      toast.success("Prompt saved successfully");
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving prompt:", error);
      toast.error("Failed to save prompt");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setPrompt(originalPrompt);
    onOpenChange(false);
  };

  const hasChanges = prompt !== originalPrompt;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[95vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit System Prompt</DialogTitle>
          <DialogDescription>
            Edit the system prompt that guides the AI&apos;s behavior. Changes
            will apply to new conversations.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              Loading prompt...
            </div>
          ) : (
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Enter your system prompt here..."
              className="h-full font-mono text-sm resize-none"
            />
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={!hasChanges || isSaving || isLoading}
          >
            {isSaving ? "Saving..." : "Save Prompt"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

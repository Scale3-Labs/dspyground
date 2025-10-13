"use client";

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputModelSelect,
  PromptInputModelSelectContent,
  PromptInputModelSelectItem,
  PromptInputModelSelectTrigger,
  PromptInputModelSelectValue,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { Response } from "@/components/ai-elements/response";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FeedbackDialog } from "@/components/ui/feedback-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PromptEditorDialog } from "@/components/ui/prompt-editor-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useChat, experimental_useObject as useObject } from "@ai-sdk/react";
import { DefaultChatTransport, type ToolUIPart } from "ai";
import {
  BookOpen,
  Database,
  FileText,
  MessageSquare,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

type GatewayModel = {
  id: string;
  name: string;
  description: string | null;
  modelType: string;
};

// Schema for structured output - matches data/schema.json
const structuredOutputSchema = z.object({
  response: z.string().optional(),
  next_agent: z.enum(["planner", "router"]).optional(),
  next_agent_app_names: z.array(z.string()).optional(),
  task_description: z.string().optional(),
  task_completed: z.boolean().optional(),
  cancel_current_request: z.boolean().optional(),
});

export default function Chat() {
  const [useStructuredOutput, setUseStructuredOutput] = useState(false);
  const [selectedModel, setSelectedModelState] = useState<string>("");
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [textModels, setTextModels] = useState<GatewayModel[]>([]);
  const [savingSample, setSavingSample] = useState(false);
  const [currentPrompt, setCurrentPrompt] = useState<string>("");
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false);
  const [promptEditorOpen, setPromptEditorOpen] = useState(false);
  const [sampleGroups, setSampleGroups] = useState<any[]>([]);
  const [currentGroupId, setCurrentGroupId] = useState<string>("");
  const [newGroupDialogOpen, setNewGroupDialogOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [schemaEditorOpen, setSchemaEditorOpen] = useState(false);
  const [schemaContent, setSchemaContent] = useState<string>("");

  // Wrap setSelectedModel to prevent empty values
  const setSelectedModel = useCallback(
    (value: string | ((prev: string) => string)) => {
      const newValue =
        typeof value === "function" ? value(selectedModel) : value;
      if (!newValue || !newValue.trim()) {
        return;
      }
      setSelectedModelState(newValue);
    },
    [selectedModel]
  );

  // Build API URL with current parameters
  const chatApiUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (selectedModel) params.set("model", selectedModel);
    return params.toString() ? `/api/chat?${params.toString()}` : "/api/chat";
  }, [selectedModel]);

  const structuredApiUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set("structured", "true");
    if (selectedModel) params.set("model", selectedModel);
    return `/api/chat?${params.toString()}`;
  }, [selectedModel]);

  // Hook for text chat
  const { messages, sendMessage, setMessages, status, stop } = useChat({
    id: "chat-text",
    transport: new DefaultChatTransport({
      api: chatApiUrl,
    }),
    onError: (error) => {
      console.error("Chat error:", error);
      toast.error("Chat error: " + error.message);
    },
  });

  // Hook for structured output
  const {
    object,
    submit,
    isLoading: isObjectLoading,
    stop: stopObject,
  } = useObject({
    api: structuredApiUrl,
    schema: structuredOutputSchema,
    fetch: async (url, options) => {
      // Custom fetch to send prompt in the correct format
      const body = options?.body ? JSON.parse(options.body as string) : {};
      const customBody = {
        prompt: body.prompt || body.input || "",
      };

      return fetch(url, {
        ...options,
        body: JSON.stringify(customBody),
      });
    },
    onError: (error) => {
      console.error("Structured output error:", error);
      toast.error("Error generating structured output");
    },
  });

  // Load preferences on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/preferences", { cache: "no-store" });
        if (res.ok) {
          const prefs = (await res.json()) as {
            selectedModel?: string;
            useStructuredOutput?: boolean;
          };

          if (prefs.selectedModel && prefs.selectedModel.trim()) {
            setSelectedModelState(prefs.selectedModel);

            // Ensure the model is in the textModels list
            setTextModels((prev) => {
              const modelExists = prev.some(
                (m) => m.id === prefs.selectedModel
              );
              if (!modelExists && prefs.selectedModel) {
                return [
                  {
                    id: prefs.selectedModel,
                    name: prefs.selectedModel,
                    description: "From preferences",
                    modelType: "language",
                  },
                  ...prev,
                ];
              }
              return prev;
            });
          } else {
            setSelectedModelState("openai/gpt-4o-mini");
          }

          if (typeof prefs.useStructuredOutput === "boolean")
            setUseStructuredOutput(prefs.useStructuredOutput);
        } else {
          setSelectedModelState("openai/gpt-4o-mini");
        }
      } catch (error) {
        console.error("Failed to load preferences:", error);
        setSelectedModelState("openai/gpt-4o-mini");
      } finally {
        setPreferencesLoaded(true);
      }
    })();
  }, []);

  // Load models
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/models", { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as {
            textModels?: GatewayModel[];
            models?: GatewayModel[];
          };
          const list = (
            data.textModels && Array.isArray(data.textModels)
              ? data.textModels
              : (data.models || []).filter((m) => m.modelType === "language")
          ) as GatewayModel[];
          setTextModels((prev) => {
            const prevModels = prev.filter(
              (pm) => !list.some((m) => m.id === pm.id)
            );
            return [...prevModels, ...list];
          });
        }
      } catch (error) {
        console.error("Failed to load models:", error);
      }
    })();
  }, []);

  // Save preferences when they change
  useEffect(() => {
    if (!preferencesLoaded) return;
    if (!selectedModel || !selectedModel.trim()) return;

    (async () => {
      try {
        await fetch("/api/preferences", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            selectedModel,
            useStructuredOutput,
          }),
        });
      } catch (error) {
        console.error("Error saving preferences:", error);
      }
    })();
  }, [selectedModel, useStructuredOutput, preferencesLoaded]);

  const handleSubmit = async (message: {
    text?: string;
    files?: unknown[];
  }) => {
    const text = message.text?.trim();
    if (!text) return;

    try {
      if (useStructuredOutput) {
        setCurrentPrompt(text);
        submit(text);
      } else {
        sendMessage({ text });
      }
    } catch (error) {
      console.error("Send error:", error);
      toast.error("Failed to send message");
    }
  };

  const handleSaveSample = () => {
    // Validate that there's content to save before opening dialog
    if (useStructuredOutput) {
      if (!currentPrompt || !object) {
        toast.error("No structured output to save");
        return;
      }
    } else {
      if (messages.length === 0) {
        toast.error("No messages to save");
        return;
      }
    }

    // Open feedback dialog
    setFeedbackDialogOpen(true);
  };

  const handleSaveWithFeedback = async (feedback: {
    rating: "positive" | "negative";
    comment?: string;
  }) => {
    try {
      setSavingSample(true);

      let samplesToSave;

      if (useStructuredOutput) {
        samplesToSave = [
          {
            id: `user-${Date.now()}`,
            role: "user",
            parts: [{ type: "text", text: currentPrompt }],
          },
          {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            parts: [{ type: "text", text: JSON.stringify(object, null, 2) }],
          },
        ];
      } else {
        samplesToSave = messages;
      }

      const res = await fetch("/api/samples", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: samplesToSave,
          feedback,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to save sample");
      }

      toast.success("Sample saved successfully");
      setFeedbackDialogOpen(false);
    } catch (error) {
      console.error("Error saving sample:", error);
      toast.error("Failed to save sample");
    } finally {
      setSavingSample(false);
    }
  };

  const handleClear = () => {
    if (useStructuredOutput) {
      setCurrentPrompt("");
      toast.success("Chat cleared");
    } else {
      setMessages([]);
      toast.success("Chat cleared");
    }
  };

  // Determine current status for UI
  const currentStatus = useStructuredOutput
    ? isObjectLoading
      ? "streaming"
      : "ready"
    : status;

  // Load sample groups
  useEffect(() => {
    loadSampleGroups();
    loadSchema();
  }, []);

  const loadSampleGroups = async () => {
    try {
      const response = await fetch("/api/sample-groups");
      if (response.ok) {
        const data = await response.json();
        setSampleGroups(data.groups || []);
        setCurrentGroupId(data.currentGroupId || "");
      }
    } catch (error) {
      console.error("Failed to load sample groups:", error);
    }
  };

  const loadSchema = async () => {
    try {
      const response = await fetch("/api/schema");
      if (response.ok) {
        const data = await response.json();
        setSchemaContent(JSON.stringify(data, null, 2));
      }
    } catch (error) {
      console.error("Failed to load schema:", error);
    }
  };

  const handleSaveSchema = async () => {
    try {
      const parsed = JSON.parse(schemaContent);
      const response = await fetch("/api/schema", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });

      if (response.ok) {
        toast.success("Schema saved successfully");
        setSchemaEditorOpen(false);
      } else {
        toast.error("Failed to save schema");
      }
    } catch (error) {
      if (error instanceof SyntaxError) {
        toast.error("Invalid JSON format");
      } else {
        toast.error("Failed to save schema");
      }
    }
  };

  const handleCreateNewGroup = async () => {
    if (!newGroupName.trim()) {
      toast.error("Please enter a group name");
      return;
    }

    try {
      const response = await fetch("/api/sample-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newGroupName.trim() }),
      });

      if (response.ok) {
        toast.success("New sample group created");
        await loadSampleGroups();
        setNewGroupDialogOpen(false);
        setNewGroupName("");
        // Clear chat for new group
        handleClear();
      } else {
        toast.error("Failed to create sample group");
      }
    } catch (error) {
      console.error("Failed to create sample group:", error);
      toast.error("Failed to create sample group");
    }
  };

  const handleGroupChange = async (groupId: string) => {
    // Handle the special "new-group" option
    if (groupId === "new-group") {
      setNewGroupDialogOpen(true);
      return;
    }

    try {
      const response = await fetch("/api/sample-groups", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentGroupId: groupId }),
      });

      if (response.ok) {
        setCurrentGroupId(groupId);
        toast.success("Sample group changed");
      } else {
        toast.error("Failed to change sample group");
      }
    } catch (error) {
      console.error("Failed to change sample group:", error);
      toast.error("Failed to change sample group");
    }
  };

  // Determine stop handler based on mode
  const handleStop = useStructuredOutput ? stopObject : stop;

  return (
    <div className="font-sans w-full min-h-[100svh] h-[100svh] overflow-hidden flex flex-col">
      {/* Header */}
      <div className="border-b">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="text-xl font-medium">Agent Chat</div>
              <ThemeToggle />
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" asChild>
                <Link href="/how-to">
                  <BookOpen className="size-4 mr-2" />
                  How To
                </Link>
              </Button>
              <div className="flex items-center gap-2 px-3 py-1.5 border rounded-md bg-background">
                <span className="text-xs text-muted-foreground">Text</span>
                <Switch
                  checked={useStructuredOutput}
                  onCheckedChange={setUseStructuredOutput}
                />
                <span className="text-xs text-muted-foreground">
                  Structured
                </span>
              </div>
              <Select value={currentGroupId} onValueChange={handleGroupChange}>
                <SelectTrigger className="w-[180px] h-8 text-xs">
                  <SelectValue placeholder="Select group" />
                </SelectTrigger>
                <SelectContent>
                  {sampleGroups.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name} ({group.samples.length})
                    </SelectItem>
                  ))}
                  <SelectItem value="new-group" className="text-blue-600">
                    <div className="flex items-center gap-1.5">
                      <Plus className="size-3" />
                      <span>New Group</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <Button variant="ghost" size="sm" onClick={handleClear}>
                Clear
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <div className="max-w-4xl mx-auto h-full flex flex-col px-6">
          {useStructuredOutput ? (
            // Structured Output Mode
            <Conversation className="flex-1 min-h-0">
              <ConversationContent>
                {!currentPrompt ? (
                  <ConversationEmptyState
                    icon={<MessageSquare className="size-12" />}
                    title="Structured Output Mode"
                    description="Ask a question to generate a structured response"
                  />
                ) : (
                  <div className="space-y-6">
                    {/* User prompt */}
                    <div className="flex justify-end">
                      <div className="max-w-[80%] bg-primary text-primary-foreground rounded-lg px-4 py-2">
                        <p className="text-sm">{currentPrompt}</p>
                      </div>
                    </div>

                    {/* Assistant response */}
                    {object && (
                      <div className="flex justify-start">
                        <div className="max-w-[80%] space-y-2">
                          <div className="text-[10px] bg-purple-50 text-purple-700 border border-purple-200 rounded px-1.5 py-0.5 inline-block dark:bg-purple-950/30 dark:border-purple-900/40 dark:text-purple-300">
                            Structured Output{" "}
                            {isObjectLoading && "(Generating...)"}
                          </div>
                          <pre className="text-xs whitespace-pre-wrap break-words text-neutral-700 bg-neutral-50 border border-neutral-200 rounded p-4 dark:text-neutral-200 dark:bg-neutral-900 dark:border-neutral-800">
                            {JSON.stringify(object, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </ConversationContent>
            </Conversation>
          ) : (
            // Text Chat Mode
            <Conversation className="flex-1 min-h-0">
              <ConversationContent>
                {messages.length === 0 ? (
                  <ConversationEmptyState
                    icon={<MessageSquare className="size-12" />}
                    title="Start chatting"
                    description="Ask a question to begin your conversation"
                  />
                ) : (
                  messages
                    .filter((m) => m.role !== "system")
                    .map((message) => (
                      <Message from={message.role} key={message.id}>
                        <MessageContent>
                          {message.parts.map((part, i) => {
                            if (part.type === "text") {
                              const text =
                                (part as { text?: string }).text ?? "";
                              return <Response key={i}>{text}</Response>;
                            }

                            // Render tool calls
                            if (part.type.startsWith("tool-")) {
                              const toolPart = part as ToolUIPart;
                              const isCompleted =
                                toolPart.state === "output-available" ||
                                toolPart.state === "output-error";

                              return (
                                <Tool key={i} defaultOpen={isCompleted}>
                                  <ToolHeader
                                    type={toolPart.type}
                                    state={toolPart.state}
                                  />
                                  <ToolContent>
                                    <ToolInput input={toolPart.input} />
                                    {(toolPart.state === "output-available" ||
                                      toolPart.state === "output-error") && (
                                      <ToolOutput
                                        output={toolPart.output}
                                        errorText={toolPart.errorText}
                                      />
                                    )}
                                  </ToolContent>
                                </Tool>
                              );
                            }

                            return null;
                          })}
                        </MessageContent>
                      </Message>
                    ))
                )}
              </ConversationContent>
              <ConversationScrollButton />
            </Conversation>
          )}
        </div>
      </div>

      {/* Input Area */}
      <div className="border-t bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <PromptInput onSubmit={handleSubmit}>
            <PromptInputBody>
              <PromptInputTextarea
                placeholder="Type your message..."
                className="min-h-[44px] max-h-[200px]"
              />
            </PromptInputBody>
            <PromptInputToolbar>
              <PromptInputTools>
                {preferencesLoaded && selectedModel ? (
                  <PromptInputModelSelect
                    value={selectedModel}
                    onValueChange={setSelectedModel}
                  >
                    <PromptInputModelSelectTrigger>
                      <PromptInputModelSelectValue />
                    </PromptInputModelSelectTrigger>
                    <PromptInputModelSelectContent>
                      {textModels.length > 0 ? (
                        textModels.map((m) => (
                          <PromptInputModelSelectItem key={m.id} value={m.id}>
                            {m.name}
                          </PromptInputModelSelectItem>
                        ))
                      ) : (
                        <PromptInputModelSelectItem value={selectedModel}>
                          {selectedModel}
                        </PromptInputModelSelectItem>
                      )}
                    </PromptInputModelSelectContent>
                  </PromptInputModelSelect>
                ) : (
                  <div className="text-xs text-muted-foreground px-2">
                    Loading models...
                  </div>
                )}
              </PromptInputTools>
              <div className="flex items-center gap-1 ml-auto">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setPromptEditorOpen(true)}
                        className="h-8"
                      >
                        <FileText className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Edit system prompt</p>
                    </TooltipContent>
                  </Tooltip>
                  {useStructuredOutput && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setSchemaEditorOpen(true)}
                          className="h-8"
                        >
                          <Database className="size-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Edit output schema</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleSaveSample}
                        disabled={
                          (useStructuredOutput && !object) ||
                          (!useStructuredOutput && messages.length < 2) ||
                          savingSample
                        }
                        className="h-8"
                      >
                        <Plus className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Save as sample</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <PromptInputSubmit
                  status={currentStatus === "streaming" ? "streaming" : "ready"}
                  onClick={
                    currentStatus === "streaming"
                      ? (e) => {
                          e.preventDefault();
                          handleStop();
                        }
                      : undefined
                  }
                />
              </div>
            </PromptInputToolbar>
          </PromptInput>
        </div>
      </div>

      {/* Feedback Dialog */}
      <FeedbackDialog
        open={feedbackDialogOpen}
        onOpenChange={setFeedbackDialogOpen}
        onSave={handleSaveWithFeedback}
        isSaving={savingSample}
      />

      {/* Prompt Editor Dialog */}
      <PromptEditorDialog
        open={promptEditorOpen}
        onOpenChange={setPromptEditorOpen}
        currentSampleGroupId={currentGroupId}
      />

      {/* New Group Dialog */}
      <Dialog open={newGroupDialogOpen} onOpenChange={setNewGroupDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Sample Group</DialogTitle>
            <DialogDescription>
              Enter a name for your new sample group. This will help you
              organize different sets of test samples.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="group-name">Group Name</Label>
              <Input
                id="group-name"
                placeholder="e.g., Tone Tests, Safety Tests..."
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleCreateNewGroup();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setNewGroupDialogOpen(false);
                setNewGroupName("");
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateNewGroup}>Create Group</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schema Editor Dialog */}
      <Dialog open={schemaEditorOpen} onOpenChange={setSchemaEditorOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Edit Schema</DialogTitle>
            <DialogDescription>
              Edit the JSON schema for structured output generation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="schema-content">Schema (JSON)</Label>
              <Textarea
                id="schema-content"
                className="font-mono text-xs min-h-[400px]"
                value={schemaContent}
                onChange={(e) => setSchemaContent(e.target.value)}
                placeholder='{"type": "object", "properties": {...}}'
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSchemaEditorOpen(false);
                loadSchema(); // Reset to original schema
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveSchema}>Save Schema</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

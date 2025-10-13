import { Button } from "@/components/ui/button";
import { Squares } from "@/components/ui/squares-background";
import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 z-0 opacity-[0.15] dark:opacity-20">
        <Squares
          direction="diagonal"
          speed={0.5}
          squareSize={40}
          borderColor="currentColor"
          hoverFillColor="rgba(128, 128, 128, 0.3)"
          className="text-muted-foreground/40"
        />
      </div>
      <div className="container mx-auto px-4 py-24 max-w-6xl relative z-10">
        {/* Hero Section */}
        <div className="text-center mb-24 mt-12">
          <h1 className="text-8xl md:text-7xl font-bold mb-6 bg-gradient-to-b from-foreground via-foreground/90 to-foreground/50 bg-clip-text text-transparent">
            DSPyground
          </h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
            An open-source prompt optimization harness powered by{" "}
            <a
              href="https://dspy.ai/api/optimizers/GEPA/overview/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground hover:text-primary underline transition-colors"
            >
              GEPA
            </a>
            . Install directly into your existing{" "}
            <a
              href="https://ai-sdk.dev/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground hover:text-primary underline transition-colors"
            >
              AI SDK
            </a>{" "}
            agent repo, import your tools and prompts for 1:1 environment
            portability, and align agent behavior through iterative sampling and
            optimization—delivering an optimized prompt as your final artifact.
            Built for agentic loops.
          </p>
          <div className="flex justify-center">
            <Link href="/chat">
              <Button size="lg" className="text-lg px-8 py-3">
                Start Optimizing Prompts →
              </Button>
            </Link>
          </div>
        </div>

        {/* Features Section */}
        <div className="grid md:grid-cols-3 gap-8 mb-16">
          <div className="border rounded-lg p-6">
            <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center mb-4">
              <svg
                className="w-6 h-6 text-foreground"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </div>
            <h3 className="text-xl font-semibold mb-2 text-foreground">
              Bootstrap with a Basic Prompt
            </h3>
            <p className="text-muted-foreground">
              Start with any simple prompt—no complex setup required. DSPyground
              will help you evolve it into a production-ready system prompt.
            </p>
          </div>

          <div className="border rounded-lg p-6">
            <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center mb-4">
              <svg
                className="w-6 h-6 text-foreground"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </div>
            <h3 className="text-xl font-semibold mb-2 text-foreground">
              Port Your Agent Environment
            </h3>
            <p className="text-muted-foreground">
              Use a simple config file to import your existing{" "}
              <a
                href="https://ai-sdk.dev/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground hover:text-primary underline transition-colors"
              >
                AI SDK
              </a>{" "}
              prompts and tools—seamlessly recreate your agent environment for
              optimization.
            </p>
          </div>

          <div className="border rounded-lg p-6">
            <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center mb-4">
              <svg
                className="w-6 h-6 text-foreground"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
            </div>
            <h3 className="text-xl font-semibold mb-2 text-foreground">
              Multi-Dimensional Metrics
            </h3>
            <p className="text-muted-foreground">
              Optimize across 5 key dimensions: <strong>Tone</strong>{" "}
              (communication style),
              <strong>Accuracy</strong> (correctness),{" "}
              <strong>Efficiency</strong> (tool usage),
              <strong>Tool Accuracy</strong> (right tools), and{" "}
              <strong>Guardrails</strong> (safety compliance).
            </p>
          </div>
        </div>

        {/* How It Works */}
        <div className="border rounded-lg p-8 mb-16">
          <h2 className="text-3xl font-bold text-center mb-8 text-foreground">
            How It Works
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-foreground text-background rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-bold">
                1
              </div>
              <h4 className="font-semibold mb-2 text-foreground">
                Install and Port Your Agent
              </h4>
              <p className="text-sm text-muted-foreground">
                Install DSPyground in your repo and import your existing{" "}
                <a
                  href="https://ai-sdk.dev/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground hover:text-primary underline transition-colors"
                >
                  AI SDK
                </a>{" "}
                tools and prompts for 1:1 environment portability
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-foreground text-background rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-bold">
                2
              </div>
              <h4 className="font-semibold mb-2 text-foreground">
                Chat and Sample Trajectories
              </h4>
              <p className="text-sm text-muted-foreground">
                Interact with your agent and collect trajectory samples that
                demonstrate your desired behavior
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-foreground text-background rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-bold">
                3
              </div>
              <h4 className="font-semibold mb-2 text-foreground">Optimize</h4>
              <p className="text-sm text-muted-foreground">
                Run{" "}
                <a
                  href="https://dspy.ai/api/optimizers/GEPA/overview/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground hover:text-primary underline transition-colors"
                >
                  GEPA
                </a>{" "}
                optimization to generate a refined prompt aligned with your
                sampled behaviors
              </p>
            </div>
          </div>
        </div>

        {/* Installation */}
        <div className="border rounded-lg p-8">
          <h2 className="text-2xl font-bold mb-6 text-foreground">
            🚀 Get Started
          </h2>
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-3 text-foreground">
                Install
              </h3>
              <div className="bg-muted rounded-lg p-4 overflow-x-auto">
                <pre className="text-foreground text-sm">
                  {`# Using npm
npm install -g dspyground

# Or using pnpm
pnpm add -g dspyground`}
                </pre>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-3 text-foreground">
                Start
              </h3>
              <div className="bg-muted rounded-lg p-4 overflow-x-auto">
                <pre className="text-foreground text-sm">
                  {`# Initialize and start DSPyground
dspyground init
dspyground dev`}
                </pre>
              </div>
            </div>

            <div className="bg-muted border rounded-lg p-4">
              <p className="text-muted-foreground text-sm">
                <strong>💡 Tip:</strong> The app will open at{" "}
                <code>http://localhost:3000</code>. Make sure you have Node.js
                installed on your system.
              </p>
            </div>
          </div>
        </div>

        {/* Team Attribution */}
        <div className="text-center mt-16">
          <div className="inline-flex items-center justify-center space-x-2 text-muted-foreground mb-4">
            <span>Built with ❤️ by the team that created</span>
          </div>
          <div className="flex justify-center items-center space-x-3">
            <a
              href="https://langtrace.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground hover:text-primary transition-colors font-semibold"
            >
              Langtrace AI
            </a>
            <span className="text-muted-foreground">and</span>
            <a
              href="https://heyzest.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground hover:text-primary transition-colors font-semibold"
            >
              Zest
            </a>
          </div>
          <div className="mt-4">
            <div className="inline-flex items-center px-3 py-1 rounded-full bg-muted text-muted-foreground text-sm">
              Apache 2.0 Licensed • Fully Open Source
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

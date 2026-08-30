# VAYRIS

Vayris is an open-source, model-independent personal AI agent. 

Vayris is the agentic layer that gives any compatible LLM the ability to interact with a user's digital environment through tools, orchestration, memory, MCP, permissions, and execution. The LLM is simply the **brain**. Vayris is the **agent**.

## Philosophy

- **Model Independent**: Bring your own brain (OpenAI, DeepSeek, Anthropic, Ollama, etc.).
- **Local-First**: Data, API keys, and memory stay on your machine.
- **Agent Orchestration**: Vayris manages the agent loop, not the LLM.
- **Security**: Built-in permission model for tools.

## Phase 1 Architecture

```
src/
├── core/
│   └── orchestrator.ts    # The deterministic agent loop
├── providers/
│   ├── base.ts            # The model-agnostic provider interface
│   ├── registry.ts        # For discovering available providers
│   └── openai/            # OpenAI-compatible adapter implementation
├── tools/
│   ├── base.ts            # The Tool abstraction and interface
│   ├── registry.ts        # Tool registration and discovery
│   └── demo/              # Safe demonstration tools (e.g., getCurrentTime)
└── index.ts               # Demo CLI application tying it together
```

## Setup Instructions

1. **Install Dependencies**
   Make sure you have Node.js (v18+) installed.
   ```bash
   npm install
   ```

2. **Configuration**
   Copy the `.env.example` file to `.env`:
   ```bash
   cp .env.example .env
   ```
   Open `.env` and fill in your desired model configuration:
   - `VAYRIS_MODEL`: The model name (e.g., `gpt-4o-mini`, `deepseek-chat`)
   - `VAYRIS_API_KEY`: Your provider API key
   - `VAYRIS_BASE_URL`: The provider's base URL (default: `https://api.openai.com/v1`)

## Running Locally

You can start the interactive CLI mode with:

```bash
npm run dev
```

Or build and run the compiled version:

```bash
npm run build
npm start
```

## Testing

Run the test suite using Jest:

```bash
npm test
```

## Provider Support

The model provider system is abstracted behind the `ModelProvider` interface in `src/providers/types.ts`. 

To add a new provider (e.g., Anthropic which uses a different API structure), you simply:
1. Create a new class implementing `ModelProvider`.
2. Translate Vayris' internal `Message` array and `ToolDefinition` list into the provider's specific API format.
3. Translate the provider's response back into the internal `Message` format (handling text and tool calls).
4. Register it in the `ProviderRegistry`.

Currently, the `OpenAICompatibleProvider` works for OpenAI, DeepSeek, Ollama, and any other API that mimics the OpenAI Chat Completions endpoint.

## Tool System

Tools implement the `BaseTool` class in `src/tools/types.ts`. They define their:
- Name and Description
- Parameter Schema (JSON Schema for the LLM)
- Permission Level (SAFE, CONFIRM, RESTRICTED)
- Execute method

Tools are registered in the `ToolRegistry`. When the orchestrator detects the model wants to call a tool, it routes the arguments through the registry, performs permission checks, executes the tool, and feeds the result back into the reasoning loop.

## Phase 2: MCP Integration

Vayris supports the Model Context Protocol (MCP) as a first-class tool provider. MCP servers are dynamically loaded and their tools are seamlessly integrated into the native `ToolRegistry`. The orchestrator treats native tools and MCP tools identically.

To add an MCP server, create an `mcp.config.json` in the root directory:

```json
{
  "mcpServers": {
    "sqlite": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sqlite", "--db-path", "test.db"],
      "env": {}
    }
  }
}
```

Every MCP tool is automatically assigned a conservative `CONFIRM` permission level by default to prevent unauthorized execution of powerful external commands.

## Phase 3: Permission Engine & Local Memory

### Security & Permissions

Vayris enforces a strict, model-independent permission system. The LLM cannot override these permissions. Every tool is assigned a level:

- **SAFE**: Executes automatically (e.g., fetching current time, searching memory).
- **CONFIRM**: Requires explicit interactive user approval via the CLI before execution (e.g., executing system commands, modifying files, and all external MCP tools).
- **RESTRICTED**: Strictly prohibited unless explicitly enabled in the agent's context configuration.

When a tool requires confirmation, Vayris halts the execution loop, presents the tool name, description, and proposed arguments, and waits for `[y/N]`. The default is always **DENY**.

### Local Long-Term Memory

Vayris includes a local, persistent memory system powered by SQLite (`vayris_memory.db`). 

- **Philosophy**: Memory belongs to you, not the model provider. Vayris stores data locally and injects relevant context into the LLM prompt.
- **Tools**: Vayris natively understands how to use `save_memory` and `search_memory` tools.
- **Control**: All data remains on your machine and can be inspected or wiped.

## Phase 4: Core Local Capabilities

Vayris includes a suite of native tools to interact securely with your local machine.

### Available Native Tools

- **Filesystem Tools**: 
  - `list_directory` (SAFE): List contents of a folder.
  - `read_file` (SAFE): Read text from a file.
  - `search_files` (SAFE): Search for files by substring.
  - `write_file` (CONFIRM): Create or modify a text file.
  - `delete_file` (RESTRICTED): Delete a file securely.
- **System Tools**: 
  - `system_info` (SAFE): Get non-sensitive OS info (platform, memory, architecture).
  - `system_time` (SAFE): Get local ISO time.
- **Applications**: 
  - `open_application` (CONFIRM): Safely open files, URLs, or apps using the system's default handler without invoking arbitrary shell commands.

### Filesystem Workspace Security

By default, Vayris filesystem tools are strictly confined to the directory Vayris was launched in (or the path defined by `VAYRIS_WORKSPACE`). All filesystem tools validate paths against this allowed root to prevent directory traversal (`../`) and unauthorized access to system files.

## Phase 5: Browser & Developer Automation

Vayris securely automates browser and developer workflows while protecting the user from destructive actions.

### Browser Automation

Vayris uses Playwright to navigate and interact with web pages natively.
- **browser_open** (CONFIRM): Open a specific URL.
- **browser_read_page** (SAFE): Extract visible text from the page.
- **browser_find** (SAFE): Locate elements via CSS selectors.
- **browser_click** (CONFIRM): Click a button or link.
- **browser_type** (CONFIRM): Fill out a form field.
- **browser_screenshot** (SAFE): Capture a page screenshot.
- **browser_go_back** (SAFE): Navigate to previous page.

*Security Note*: URLs are strictly validated. Credentials and authentication tokens are deliberately not scraped, exposed, or saved to memory.

### Developer & Terminal Tools

Vayris supports structured developer operations restricted to allowed workspaces. Unrestricted shell execution is explicitly disabled.
- **git_status** (SAFE): Read repository status.
- **git_diff** (SAFE): Read repository diffs.
- **project_info** (SAFE): Read package and build information.
- **run_tests** (CONFIRM): Safely executes `npm run test` without invoking an unrestricted shell.
- **run_build** (CONFIRM): Safely executes `npm run build`.

*Security Note*: Output is automatically capped at 50KB to prevent context exhaustion, and commands timeout after 30 seconds.

## Phase 6: Agentic Planning & Task Execution

Vayris orchestrates tasks using a robust, stateful execution engine designed to give the LLM structured planning capabilities.

### Task Engine Architecture
- **Stateful Tasks**: Every user goal generates a `TaskState` tracked across `PENDING`, `RUNNING`, `WAITING_FOR_PERMISSION`, `VERIFYING`, `COMPLETED`, `FAILED`, and `CANCELLED`.
- **Planning vs Reacting**: For complex goals, the model proposes a multi-step plan (`propose_plan`) with verification criteria. For simple questions, the model can answer directly without overcomplicating execution.
- **Adaptive Execution**: After each tool call, the model observes the `ToolResult`. If a step fails, the model can diagnose the issue, request permission, and retry or revise the plan.
- **Verification**: The agent cannot declare success on complex tasks without actively completing verification checks using the `complete_task` step.
- **Loop Protection**: Vayris actively monitors tool execution and will forcefully fail tasks that repeatedly execute identical failing actions without state change.

### UX & Observability
Internally, Vayris tracks granular event types (e.g., `TASK_STARTED`, `TOOL_CALLED`, `PERMISSION_REQUESTED`) to power future interactive UIs, while logging structured summaries natively to the terminal.

## Runtime Model Connection (Bring Your Own Brain)

Vayris is strictly a model-independent agent. It does not hardcode, prefer, or bundle any specific LLM provider. The user chooses the "brain" by configuring the runtime via environment variables.

### Provider Architecture
Vayris interacts with LLMs through a generic `ModelProvider` interface. The `openai-compatible` adapter maps Vayris's internal tool representations into standard JSON-Schema payloads, and safely unpacks the result back into internal models.

### Model Configuration
You must configure the runtime before starting Vayris using a `.env` file or environment variables:

```env
VAYRIS_PROVIDER=openai-compatible
VAYRIS_MODEL=gpt-4o-mini
VAYRIS_API_KEY=your_api_key_here
# Optional base URL for proxy endpoints or local models:
VAYRIS_BASE_URL=https://api.openai.com/v1
```

### Local Models
Because Vayris uses standard protocol adapters (like `openai-compatible`), you can easily drop in a local model (such as Llama 3 running via LM Studio or vLLM) simply by pointing `VAYRIS_BASE_URL` to your local `http://localhost:1234/v1` endpoint. No core codebase changes are required.

## Local Application & UI (Phase 7 & 8)

Vayris is transitioning from a CLI utility into a premium local application.
- **Frontend**: A minimal, futuristic React application isolated from the core logic.
- **Event Architecture**: The Node server broadcasts task states (`TOOL_CALLED`, `STEP_FAILED`) via WebSockets to the UI in real-time.
- **Voice Foundation**: The application utilizes standard Web Speech APIs to allow hands-free task definition and auditory readouts of final responses.
- **Separation of Concerns**: The UI holds no agent logic. All execution, permissions, limits, and planning remain strictly governed by the Vayris core backend.

## Live Model Streaming (Phase 9)

Vayris supports live incremental streaming of model responses directly to the UI, enabling a significantly faster and more interactive agent experience.
- **Provider Fallback**: Streaming is implemented as an optional capability (`generateResponseStream`). If a selected provider adapter does not yet implement chunk parsing, Vayris seamlessly falls back to the standard request/response cycle.
- **Tool-Call Reconstruction**: Streaming providers are strictly required to buffer and reconstruct scattered JSON fragments of tool-calls internally. The `TaskEngine` never executes partial tool arguments.
- **Cancellation**: Full streaming cancellation is supported via `AbortController`. Stopping an active task in the UI immediately terminates the network stream, halts the task engine, and prevents orphaned requests.

## Voice Integration (Phase 10)

Vayris integrates seamless two-way voice via browser Web Speech APIs. The `useVoiceIntegration` hook manages continuous listening, final transcript submission to the task engine, and streams model output to text-to-speech incrementally for near-instant auditory response.

## Vision & Screen Context (Phase 11)

Vayris can receive visual context to aid reasoning, while preserving model independence.
- **Image Attachments**: Users can upload images which are safely converted to Base64 and routed to multimodal-capable LLMs.
- **Explicit Screen Capture**: Vayris includes a `capture_screen` native tool that triggers a native browser `getDisplayMedia` prompt. Screen capture is never continuous or hidden. Base64 strings are deliberately stripped from UI broadcasting to maintain performance.

## Command Center UX (Phase 12)

Vayris features a polished, premium "Command Center" React interface.
- **Information Architecture**: Consolidated sidebar navigation for Conversation, Session History, Capabilities, Long-term Memory, and Settings.
- **Task Timeline**: A visual tracker abstracting complex agent events (e.g., tool calls, verification) into a cohesive timeline.
- **VayrisOrb**: A dynamic, visually rich state indicator with overlapping `mix-blend-screen` gradients responding to agent states (`THINKING`, `EXECUTING`, `SPEAKING`).
- **Security Visibility**: The UI explicitly flags permission requests with risk indicators (LOW RISK, MODERATE, HIGH IMPACT) and lists available tools dynamically via the backend tool registry.

## Limitations (Not Yet Implemented)
- **Vector/Semantic Search**: The current memory search uses simple text matching.
- **Universal Streaming**: Currently, only the `openai-compatible` adapter natively supports the chunked SSE parser. Other models fallback to synchronous behavior.
- **Background Autonomy**: Agents do not run unsupervised in the background indefinitely yet.

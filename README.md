# Vayris

**Vayris** is a local-first AI assistant that combines deterministic computer control, low-latency conversation, and deep agentic reasoning.

Instead of relying entirely on a slow, expensive cloud model to do everything, Vayris intelligently splits workloads:
- **FAST Model**: Instant, low-latency conversational interaction.
- **DEEP Model**: Heavy agentic reasoning, tool usage, and complex multi-step tasks.
- **ZERO-LLM (Deterministic)**: Instant operating system actions (launching apps, opening websites, stopping tasks) that bypass LLMs entirely.

The entire system is designed to be local-first, privacy-focused, and extensible via the Model Context Protocol (MCP).

---

## Architecture

```text
USER
 │
 ▼
INPUT NORMALIZER
 │
 ▼
FAST ROUTER
 │
 ├─────────────────────────────────────────┐
 │                                         │
 ▼                                         ▼
FAST CHAT / SYSTEM ACTION                 DEEP TASK
 │                                         │
 ├── DIRECT CHAT (FAST_MODEL)              ├── TASK ENGINE (DEEP_MODEL)
 │                                         │
 └── DETERMINISTIC (ZERO LLM)              ├── Tools / MCP Servers
     - Launch Windows Apps                 ├── Multi-step Planning
     - Open Browser URLs                   ├── Verification
     - System Cancellation                 └── Error Recovery
 │                                         │
 └────────────────────┬────────────────────┘
                      │
                      ▼
               VERIFICATION & 
              ZERO-DUPLICATION 
               STREAM RESULT
                      │
                      ▼
                  VAYRIS UI
```

---

## Key Features

- **Dual-Model Execution:** Combines a fast model (e.g. `llama3.2:1b`) for instant chat, and a deep model (e.g. `qwen3:4b`) for heavy lifting.
- **Local-First & Privacy:** Your models, your API keys, your local files. No cloud dependency unless you configure one.
- **Windows Application Control:** Launch and interact with Windows applications locally (requires Windows OS).
- **Browser Automation:** Perform live browser research and UI interaction.
- **Model Context Protocol (MCP):** Connect to file systems, SQLite databases, and custom external tool APIs dynamically.
- **Immediate Task Cancellation:** Hardware-level cancellation aborts any running task (including executing models) instantaneously without breaking state.
- **3D Glass UI:** An atmospheric, responsive front-end experience.

---

## Setup & Installation

Vayris is designed so you can fork it, connect your own models, and run it locally.

### 1. Prerequisites
- **Node.js** (v18+)
- **Git**
- **Ollama** (if you want to run models entirely locally)

### 2. Clone the Repository
```bash
git clone https://github.com/DevanshLamba/vayris-ai.git
cd vayris-ai
```

### 3. Install Dependencies
```bash
# Install backend dependencies
npm install

# Install frontend dependencies
cd ui
npm install
cd ..
```

### 4. Environment Configuration
Create a `.env` file in the root directory:
```bash
cp .env.example .env
```

Edit the `.env` file and configure your models. By default, Vayris uses local Ollama models.

```env
LOCAL_MODEL_BASE_URL=http://127.0.0.1:11434/v1
FAST_MODEL=llama3.2:1b
DEEP_MODEL=qwen3:4b
```

*(Note: Secrets and credentials should NEVER be committed to Git. `.env` is ignored by default).*

### 5. Download Models (If using Ollama)
If you are using the default local setup, you need to pull the models:
```bash
ollama pull llama3.2:1b
ollama pull qwen3:4b
```
*You can configure Vayris to use **any** OpenAI-compatible endpoint or model simply by changing the environment variables.*

---

## Starting Vayris

### Production Mode
To build the frontend and backend, then start a single server:
```bash
npm run build
npm run start
```
*The UI will be available at `http://localhost:3000`.*

### Development Mode
For hot-reloading and active development, run the backend and frontend separately:

**Terminal 1 (Backend):**
```bash
npm run dev
```

**Terminal 2 (Frontend):**
```bash
npm run dev:ui
```
*The UI will be available at `http://localhost:5173`.*

---

## How It Works

### Execution Modes
You can select the execution mode in the UI, or leave it on **AUTO**:

- **AUTO**: The router decides instantly. If you ask "How are you?", it streams the FAST model. If you say "Analyze my project", it triggers the DEEP model + Task Engine.
- **FAST**: Forces the query to the FAST model. Perfect for quick lookups and normal conversation.
- **DEEP**: Forces the query to the DEEP model + Task Engine for research and tool execution.

**Deterministic System Actions** (like "Open YouTube", "Launch Notepad", or "Stop") bypass the LLM entirely and execute instantaneously in under 20ms, regardless of the selected mode.

### System & Browser Control
Vayris interacts with your local machine.
- **Windows Applications**: The backend maintains a local index of installed Windows apps. Saying "Open VS Code" launches it natively. *(Windows-only)*.
- **Browser Automation**: Vayris uses Playwright to open and read websites. It launches a local Chromium instance on your machine.
- **Permissions**: Sensitive tool executions will pause and request your approval via the UI before proceeding.

---

## Security & Privacy

The public GitHub repository is simply the product source code. 
**Your machine is not part of the repository.** 

- Your `.env`, API keys, and browser sessions remain on your machine.
- Private memory stores (`vayris_memory.db`) and task logs are generated at runtime and ignored by Git.
- Local system actions are executed securely via your own user permissions.

---

## Troubleshooting

- **"Error: The following models are missing..." on Startup**
  Vayris checks if your configured models actually exist on Ollama before booting to prevent mid-task crashes. Ensure you have run `ollama pull <model-name>` for the exact names listed in your `.env`.
- **Port Conflicts**
  If `3000` is taken, update the backend port configuration in `src/server.ts` and verify the frontend connects correctly.
- **Browser Fails to Launch**
  Ensure you have run `npx playwright install` if the browser automation tools fail to start.

---

## Contributing
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Test core functionality (FAST chat, DEEP tools, Deterministic actions)
4. Commit your changes
5. Submit a Pull Request

---

*Vayris is a robust, local-first multi-agent ecosystem. Customize your tools, swap your models, and build.*

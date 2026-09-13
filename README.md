# Vayris AI

> **Open Source — Apache License 2.0**
>
> Copyright © 2026 Devansh Lamba.

**Vayris AI** is a local-first AI assistant that combines deterministic computer control, low-latency conversation, and deep agentic reasoning. 

Instead of relying entirely on a slow, expensive cloud model to do everything, Vayris intelligently splits workloads:
- **FAST Model**: Instant, low-latency conversational interaction.
- **DEEP Model**: Heavy agentic reasoning, tool usage, and complex multi-step tasks.
- **ZERO-LLM (Deterministic)**: Instant operating system actions (launching apps, opening websites, stopping tasks) that bypass LLMs entirely.

This repository is a monorepo containing both the **Web version** and the standalone **Desktop App version** of Vayris AI.

---

## 📂 Project Structure

- [`/Vayris_Web`](./Vayris_Web) — The browser-based web application of Vayris. Runs as a local server with a React/Vite frontend.
- [`/Vayris_App`](./Vayris_App) — The standalone desktop application (built with Electron). Offers deeper OS integration and a native application experience.

---

## 🧠 System Architecture

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

## ✨ Key Features

- **Dual-Model Execution:** Combines a fast model (e.g., `llama3.2:1b`) for instant chat, and a deep model (e.g., `qwen3:4b` or `deepseek-coder`) for heavy lifting.
- **Local-First & Privacy:** Your models, your API keys, your local files. No cloud dependency unless you configure one.
- **Windows Application Control:** Launch and interact with Windows applications locally (requires Windows OS).
- **Model Context Protocol (MCP):** Connect to file systems, SQLite databases, and custom external tool APIs dynamically.
- **Hardware-Level Cancellation:** Instantly abort any running task (including executing models) without breaking state.
- **3D Glass UI:** An atmospheric, responsive front-end experience.

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js** (v18+)
- **Git**
- **Ollama** (for running local AI models)

### 2. Choose Your Version

You can run Vayris AI either as a Web Service or as a Desktop App.

#### Option A: Running Vayris Web
Navigate to the Web directory to install and start the web version:
```bash
cd Vayris_Web
npm install
npm run start
```
*(See `Vayris_Web/README.md` for detailed environment configuration).*

#### Option B: Running Vayris App (Desktop)
Navigate to the App directory to install and start the Electron desktop version:
```bash
cd Vayris_App
npm install
npm start
```
*(See `Vayris_App/README.md` for detailed environment configuration and build instructions).*

---

## 🛠️ Configuration

Both versions rely on a `.env` file for configuration. Copy the example file in the respective folder:

```bash
cp .env.example .env
```
Key configurations include connecting to Ollama, setting up your preferred models, and configuring MCP servers.

---

## 📄 License

This project is licensed under the Apache License 2.0. See the `LICENSE` file for details.

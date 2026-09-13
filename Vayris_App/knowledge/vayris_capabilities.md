# Vayris Capabilities

## Conversation
CURRENTLY IMPLEMENTED: LLM-based natural conversation using FAST or DEEP models.

## Model Modes
CURRENTLY IMPLEMENTED: Explicit AUTO, FAST, and DEEP modes.

## System Actions
CURRENTLY IMPLEMENTED: Deterministic actions such as asking for time/date, querying OS/CPU info, checking git status, and stopping tasks.

## Application Control
CURRENTLY IMPLEMENTED: Application-resolution behavior to open/launch installed applications without an LLM.

## Browser
CURRENTLY IMPLEMENTED: Opening websites, searching Google/YouTube, closing the browser, navigating back, and reading the page title.
FUTURE / PLANNED: Complex browser automation and DOM interaction.

## Tools
CURRENTLY IMPLEMENTED: Existing native tools (system command, filesystem read/write, native app/browser launcher) and MCP capability.

## Task Execution
CURRENTLY IMPLEMENTED: Complex task and tool loop execution using TaskEngine and AgentOrchestrator.

## Cancellation
CURRENTLY IMPLEMENTED: First-class task cancellation that forcefully aborts active processes.

## RAG
CURRENTLY IMPLEMENTED: Local SQLite-based vector retrieval of Markdown documents and code knowledge using Nomic embeddings.

## Streaming
CURRENTLY IMPLEMENTED: Real-time assistant text output streamed chunk-by-chunk to the UI.

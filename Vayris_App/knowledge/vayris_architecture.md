# Vayris Architecture

## Input

Text input and existing voice-related input where implemented.

## Routing

Existing Vayris router determines the execution path based on the user's intent.

## Deterministic Actions

Actions that can be executed without an LLM should bypass the LLM. 

Examples:
- Open YouTube → browser → zero LLM
- Open application → application resolver → zero LLM
- Stop/cancel → cancellation system → zero LLM

## FAST

Model: llama3.2:1b
Purpose:
- low-latency conversation
- simple questions
- quick interaction
- RAG-assisted answers when knowledge is needed and FAST is selected

## DEEP

Model: qwen3:4b
Purpose:
- complex reasoning
- tool-heavy tasks
- multi-step tasks
- deep analysis
- RAG-assisted reasoning

## AUTO

Existing routing chooses the appropriate execution path based on intent and query complexity.

## RAG

RAG is a shared optional knowledge layer.
It can feed both FAST and DEEP execution paths.

## Core Identity

Identity is separate from RAG. The core identity is directly injected into the system prompt.

## Tools

Tools execute actions on the local system (e.g., executing commands, reading files).

## Orchestration

AgentOrchestrator and TaskEngine manage complex execution and tool loops where applicable.

## Permissions

Permissions remain separate from identity and knowledge, ensuring secure tool execution.

## Cancellation

Cancellation is authoritative and should terminate active work immediately.

## Streaming

Responses are streamed directly to the UI for low latency feel.

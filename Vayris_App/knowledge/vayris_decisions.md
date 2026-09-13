# Engineering Decisions

## Dual models
FAST model: for low-latency communication.
DEEP model: for complex reasoning and tool-heavy work.
Reason: Avoid making every interaction pay the cost of a larger/deeper model.

## Deterministic actions
Use zero-LLM execution whenever the action is deterministic.
Reason: Lower latency and greater reliability.

## RAG
RAG is optional, shared by FAST and DEEP.
Reason: Provide external/local knowledge without embedding all knowledge into the model and without slowing simple interactions.

## Core identity
Identity is separate from RAG.
Reason: Basic identity must always be available without retrieval latency.

## Model selection
Explicit FAST/DEEP mode must remain authoritative.
Reason: The user controls the desired reasoning/speed tradeoff.

## Local-first
Use local infrastructure where possible.
Reason: privacy, control, latency, and independence from cloud services.

## Cancellation
Cancellation is first-class.
Reason: a personal computer agent must be interruptible immediately.

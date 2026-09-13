# Vayris Workflows

## Normal conversation
User → Router → FAST → response

## Knowledge query
User → Router → RAG → selected model → response

## Deep knowledge task
User → Router → RAG → DEEP → tools if required → verification → response

## Deterministic browser action
User → Router → browser tool → result
(No LLM used for actions the router can fulfill deterministically)

## Application opening
User → application resolver → local application

## Cancellation
User → cancellation path → abort active task

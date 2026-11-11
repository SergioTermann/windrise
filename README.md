# Windrise LLMWiki

Windrise LLMWiki is a local knowledge assistant and diagnostic orchestration system for wind farm operations and maintenance. It organizes turbine faults, site standard operating procedures (SOPs), manufacturer manuals, historical work orders, and expert rules into a traceable, verifiable technical architecture with a feedback loop.

## Project Overview

- Local-first operation: supports LM Studio and local models, with knowledge storage and diagnostic workflows that can run on an internal network.
- LLMWiki knowledge foundation: indexes fault codes, turbine models, components, measurement points, work orders, SOPs, and source documents.
- WindOps diagnostic workflow: converts alarms or field reports into structured cases, then uses a Planner to develop troubleshooting paths.
- Traceable evidence: answers must cite sources such as manufacturer manuals, fault-code tables, site SOPs, expert rules, or historical work orders.
- Safety gates: for actions such as resets, bypasses, power curtailment, tower climbing, de-energization, and re-energization, prioritizes risks, prerequisites, and human confirmation points.
- Feedback loop: captures root causes, corrective actions, spare parts, recurrence rates, and expert reviews when work orders are closed.

## Technical Architecture

```text
Business Entry Points
  -> Alarms / Fault codes / Maintenance questions / Brief field updates

Data Normalization Layer
  -> Turbine, model, fault code, component, measurement point, time,
     operating conditions, and field status

LLMWiki Knowledge Layer
  -> Manufacturer manuals, fault-code tables, site SOPs, expert rules,
     historical work orders, and graph paths

Diagnostic Orchestration Layer
  -> Case normalization, Planner task decomposition, candidate cause ranking,
     and verification action generation

Tools and Systems Layer
  -> Read-only interfaces for CMS, SCADA, EAM, spare parts, weather,
     and work permits

Safety and Compliance Layer
  -> Operational risk identification, mandatory human confirmation,
     and prevention of unauthorized execution

Feedback and Learning Layer
  -> Work-order outcomes, expert reviews, short-lived information with TTL,
     and local project memory
```

## Core Capabilities

### Fault Diagnosis

- Supports exact fault-code matching, manufacturer/model constraints, and ambiguity detection for short codes.
- Integrates the Ambiguity Entropy Gate (AEG): calculates the distribution of meanings for a fault code from the local `wind-llmwiki/fault-index.jsonl`. When model/manufacturer/wind farm context is missing and entropy exceeds the threshold, it requests clarification before LLMWiki retrieval to avoid matching an unrelated meaning of the same code.
- Once the model/manufacturer is provided, LLMWiki weights evidence by applicability and excludes explicitly conflicting manuals for other models or manufacturers while retaining general SOPs.
- Integrates a Grounding Validator: checks fault codes, manufacturer/model scope, and LLMWiki citation consistency before returning the final answer. Exact matches are labeled for applicability; general or similar materials are explicitly marked as reference material only. Answers that explicitly cite an incorrect fault code fail grounding validation, and the failure is recorded in the trace.
- Returns fault meanings, possible causes, troubleshooting steps, reset conditions, and safety reminders.
- Uses the LLMWiki evidence hierarchy: manufacturer manuals/fault-code tables > site SOPs > expert rules > closed historical work orders > unverified experience.

AEG is enabled by default, with a default threshold of `0` (all fault codes with nonzero ambiguity entropy require clarification first). Use environment variables to adjust or disable it:

```bash
export WINDRISE_AEG_ENTROPY_THRESHOLD=0.5
export WINDRISE_AEG_ENABLED=0
```

### Work-Order Generation

- Generates maintenance work-order recommendations from diagnostic cases.
- Includes the affected equipment, symptoms, scope of impact, risk level, handling steps, recommended spare parts, and verification criteria.
- Feeds closure outcomes back into project knowledge and subsequent diagnostic workflows.

### Local Memory

- Uses Windrise's own lightweight memory layer.
- Retains the most recent fault context, completed actions, brief user updates, and key context within a session.
- Persists project memory in local JSON files, with optional mem0 integration for long-term memory.

### mem0 Long-Term Memory

mem0 is optional so that local operation does not require an API key. Once an API key is configured, Windrise also writes conversation turns to mem0 and retrieves relevant long-term memories for the current question before the next request.

```bash
export WINDRISE_MEM0_API_KEY=your_mem0_api_key
export WINDRISE_MEM0_ENABLED=1

# Optional
export WINDRISE_MEM0_USER_ID=windrise-user
export WINDRISE_MEM0_AGENT_ID=windrise
export WINDRISE_MEM0_APP_ID=windrise-llmwiki
export WINDRISE_MEM0_TOP_K=5
```

The implementation uses the mem0 Cloud REST API without installing the `mem0ai` SDK because the project's `@anthropic-ai/sdk@0.68.0` conflicts with the peer dependency range required by `mem0ai@3.x`. The REST adapter is located at `windops/memory/mem0-adapter.mjs` in the memory layer. Without mem0 configuration, the system continues to use local JSON memory.

## Directory Guide

```text
windops/                    Seven-layer wind operations architecture (one directory per layer)
  business/                 1. Business: system instructions and intent routing
  data/                     2. Data: FaultQueryRewriter, structured cases, and manufacturer/term synonyms
                            + Query rewrite audits (slot source_span, provenance, confidence, version)
  memory/                   3. Memory: four memory tiers + Memory Router + mem0
                            + Working memory (TTL/confidence decay)
                            + Cold start (asset-register onboarding, similar-fleet transfer,
                              and expert-rule fallback)
                            + Dynamic profile updates (event-based extraction, real-time short-term
                              cache, and batch persistence of closed work orders)
  core/                     4. Model application: Planner (evidence, spare parts, and inspection
                              defects incorporated into plan steps), Safety Gate, and orchestrator
                            + Three-tier LLM Wiki knowledge organization (L1 semantic cache ->
                              L2 multi-channel retrieval -> L3 tiered reranking and evidence
                              gating by component/fault-code applicability)
                            + AEG ambiguity entropy gate
                            + Grounding Validator (outbound fault-code/model/citation consistency)
  tools/                    5. Tools: ToolRegistry + Executor (retries, timeouts, graceful degradation,
                              and safety gates) + mock connectors
                            + Tool Observation (tool_call_id, schema version, idempotency key,
                              and degradation reason)
  models/                   6. Models: task routing, evidence grading, L1 semantic cache, BM25 retrieval,
                              vector semantic retrieval, component-fault-action-spare-part graph,
                              time-series anomaly detection, and multimodal inspection analysis
                              (defect labels enter the diagnostic chain as graded evidence)
  feedback/                 7. Feedback: work-order closure, TraceLogger, review pool
                              (trace persistence/governance), and KPI collection
                            + Knowledge feedback loop (verified resolution cards return to
                              LLM Wiki L1 after governance approval)
                            + Quality gates/reward governance (routing by grounding, safety
                              boundaries, and Planner completeness)
                            + Query rewrite/KPI quality metrics (rewrite status, slot confidence,
                              and gate status)
                            + SFT/preference/RL sample exporters (structured export only;
                              no automatic admission to the training pool)
  tests/                    Seven-layer unit tests + HTTP integration tests (189 tests)
  index.mjs                 Unified entry point for the seven layers
  test-architecture.mjs     Seven-layer architecture snapshot tests
src/commands/llmwiki/       LLMWiki commands, queries, traces, and knowledge evidence ranking
src/skills/bundled/         Built-in wind turbine fault diagnosis and work-order generation skills
scripts/windrise-chat.mjs   Local chat entry point (uses the windops/ seven-layer architecture)
scripts/doc-knowledge-server.mjs
                            Document knowledge service, session memory, and project memory
scripts/build-wind-llmwiki.mjs
                            Builds the wind power LLMWiki knowledge index
scripts/build-fault-index.mjs
                            Builds the structured fault-code index
scripts/build-fault-mechanism-graph.mjs
                            Builds the fault mechanism graph
wind-llmwiki/               Generated wind power knowledge assets
generated-knowledge/        Structured knowledge, graphs, and evaluation outputs
```

## Common Commands

```bash
npm install
npm run build:wind-knowledge
npm run smoke:wind-llmwiki
npm run eval:faults
npm run smoke:skills
npm run serve:doc-knowledge
npm test                     # All seven-layer tests (unit + HTTP integration)
npm run test:windops-unit    # Seven-layer unit tests only (domain/data/memory/core/tools/models/business/orchestrator)
npm run test:windops-api     # HTTP end-to-end integration tests only (manages the server lifecycle)
```

## Local Model Configuration

The system targets local model services by default. Configure the model endpoint with environment variables:

```bash
export LMSTUDIO_BASE_URL=http://127.0.0.1:1234/v1
export LMSTUDIO_MODEL=qwen/qwen3.5-9b
```

Then run:

```bash
npm run run:lmstudio -- "Find the troubleshooting path for fault code 303804"
```

## Validation

After modifying the diagnostic architecture, LLMWiki indexes, or built-in skills, run:

```bash
node --check scripts/windrise-chat.mjs
npm run eval:faults
npm run smoke:skills
npm run smoke:wind-llmwiki
```

## Naming Conventions

The project is named Windrise LLMWiki. The README, package name, and runtime output should use Windrise / LLMWiki terminology. Upstream strings in the historically recovered source remain as legacy implementation details and do not define the current project identity.

# Antigravity Workspace Agent Configuration

This workspace is configured with local AI engines (**OpenCode** and **Ollama**) for fast, autonomous code generation, refactoring, and execution.

---

## 1. Local Development Agents & Engines

### A. OpenCode Development Engine
- **Service**: OpenCode CLI / Server
- **Running Port**: `http://localhost:39437` (Process: `opencode --port 39437`)
- **Primary Use**: Autonomous code refactoring, full-file edits, and automated project modifications.

### B. Ollama Local LLM Engine
- **Service**: Ollama Daemon (`http://localhost:11434`)
- **OpenAI-Compatible API Endpoint**: `http://localhost:11434/v1`
- **Available Models**:
  - `qwen3.5:9b` (General Coding & Logic)
  - `llama3:latest` (Fast Instructions & Chat)
  - `gemma4:e4b` (Complex Reasoning)
  - `nomic-embed-text:latest` (Embeddings & Semantic Search)

---

## 2. Agent Workflow Guidelines

1. **Local Model Routing**:
   - For fast offline code analysis, generation, and test execution, Antigravity delegates tasks to Ollama via `http://localhost:11434/v1` using model `qwen3.5:9b` or `llama3:latest`.
   
2. **OpenCode Autonomous Execution**:
   - Complex multi-file refactoring or execution tasks can be dispatched to OpenCode running on port `39437` or executed via standard UV agent scripts:
     `python -m uv run --with openai C:\Users\user\Desktop\kimi-agent\app.py`

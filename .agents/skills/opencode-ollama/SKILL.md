---
name: opencode-ollama
description: Integration skill to run development tasks, code edits, and queries using OpenCode server (port 39437) and local Ollama models (http://localhost:11434). Trigger this when delegating coding tasks to local AI agents.
---

# OpenCode & Ollama Agent Integration Skill

This skill allows Antigravity to delegate development, refactoring, and code generation tasks directly to local **OpenCode** and **Ollama** agents.

---

## 1. Ollama Integration (Local Models)

Ollama is running locally at `http://localhost:11434` with an OpenAI-compatible interface at `http://localhost:11434/v1`.

### Model Roster:
- **`qwen3.5:9b`**: High accuracy code generation and architecture analysis.
- **`llama3:latest`**: Rapid instruction following and helper scripts.
- **`gemma4:e4b`**: Deep logic and code review.
- **`nomic-embed-text`**: Vector embeddings for codebase search.

### Python Usage Pattern:
```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:11434/v1",
    api_key="ollama"
)

response = client.chat.completions.create(
    model="qwen3.5:9b",
    messages=[
        {"role": "system", "content": "You are a senior software developer."},
        {"role": "user", "content": "Refactor this function for maximum performance."}
    ]
)
print(response.choices[0].message.content)
```

---

## 2. OpenCode Agent Server Integration

OpenCode is running as a background service on port `39437` (`opencode --port 39437`).

### Querying OpenCode API:
```powershell
Invoke-RestMethod -Uri "http://localhost:39437/v1/chat/completions" `
  -Method POST `
  -Headers @{ "Content-Type" = "application/json" } `
  -Body '{"model": "qwen3.5:9b", "messages": [{"role": "user", "content": "Run project checks"}]}'
```

---

## 3. Delegating Tasks to Execution Script
To trigger full codebase updates or complex multi-file agent execution:
```powershell
python -m uv run --with openai C:\Users\user\Desktop\kimi-agent\app.py
```

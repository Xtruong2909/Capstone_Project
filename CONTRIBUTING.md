# 🤝 Contributing & AI Coding Guidelines

Welcome to Capstone Project!

All team members and AI assistants (Antigravity, Cursor, Copilot, ChatGPT) working on this project must follow the strict standards defined in [AGENTS.md](./AGENTS.md).

## Quick Summary for AI Assistants

1. Read `AGENTS.md` before generating code.
2. Follow `snake_case` for Python and `PascalCase` / `camelCase` for React/TypeScript.
3. Follow Layered Architecture: `Routers -> Services -> CRUD -> Models`.
4. Use Type Hints in Python and Strict Types in TypeScript (No `any`).
5. Never hardcode secrets or API keys.
6. Validate Goong Map API Lat/Lng ordering (`{ lat, lng }` vs `[lng, lat]`).

# SysSentinel: User-Friendly, Zero-Trust System Monitor & Web Dashboard

Build a production-ready, zero-trust system diagnostic and telemetry daemon in Node.js named **"SysSentinel"**. It must compile into a standalone Windows `.exe` using `pkg` so non-technical users can run it instantly without installing Node.js or dealing with command-line interfaces.

---

## Core Requirements & Specifications

### 1. Zero-Config, Browser-Based GUI (No Electron Bloat)

- When the `.exe` is double-clicked, it must automatically spin up a lightweight local HTTP server and launch the user's default web browser (Brave, Edge, Chrome) to a clean, modern web dashboard.
- **The Dashboard UI:**
  - **System Health Status Card:** A prominent visual indicator (Green for normal, Orange/Red for warning) showing real-time CPU load and Free RAM in plain English.
  - **Active Anomaly Feed:** Simple human-friendly cards translating technical metrics into understandable insights (e.g., _“⚠️ Brave Browser is utilizing 85% of your available memory”_ or _“⚠️ A new background script just launched automatically”_).
  - **Action Controls:** Clear, clickable buttons for _"Refresh Status"_, _"View History"_, and _"Uninstall Safely"_.

### 2. System Monitoring Engine

- Poll system metrics every 5 to 10 seconds using the `systeminformation` library.
- Track and record:
  - Total and free RAM (in GB).
  - Current CPU load percentage.
  - Top resource-hogging process (Name, Process ID, CPU %, RAM %).
  - **Terminal & Script Popups:** Scan for unexpected terminal spawn events (`cmd.exe`, `powershell.exe`, `wt.exe`) to catch background popups.

### 3. Dual-Stream Logging (Human & AI Friendly)

Write logs locally to `%PROGRAMDATA%\SysSentinel\logs\` (or fallback to a local `./logs/` directory):

- **`activity.md` (Human-Friendly Log):** Clean Markdown log containing timestamps, plain-English summaries, and resource spikes.
- **`activity.jsonl` (AI-Friendly Log):** Structured JSON Lines format containing exact PIDs, command-line paths, and system health snapshots optimized for direct ingestion into an LLM for root-cause analysis.

### 4. Zero-Trust Uninstaller & Transparency

- Provide a clear, non-technical **"Uninstall & Clean Up"** button directly on the web interface.
- Clicking it must display a simple explanation before deleting the Windows Scheduled Task (`SysSentinelMonitor`), killing active processes, and purging the local data directory entirely, leaving zero residual footprint.

---

## Implementation Outline (`server.js`)

The application should bundle an HTTP server using Node's built-in `http` module, serve an embedded HTML/Tailwind frontend string directly from the single file, and use the `opn` or `child_process` `start` command to open the browser automatically.

### Key Components to Implement:

1. **Express/HTTP Server:** Serves the dashboard UI on a random or fixed local port (e.g., `http://localhost:4820`).
2. **WebSocket or Polling API:** Pushes real-time CPU/RAM metrics to the frontend UI every few seconds.
3. **Task Scheduler Hook:** Handles background installation via `schtasks` with full transparency prompts if triggered via command-line flags.
4. **Standalone Packaging:** Compiled via `pkg server.js --targets node18-win-x64 --output SysSentinel.exe`.

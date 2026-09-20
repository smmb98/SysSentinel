# SysSentinel: User-Friendly, Zero-Trust System Monitor & Web Dashboard

Build a production-ready, zero-trust system diagnostic and telemetry daemon in Node.js named **"SysSentinel"**. It must compile into a standalone Windows `.exe` using `pkg` so non-technical users can run it instantly without installing Node.js or dealing with command-line interfaces.

---

## Core Requirements & Specifications

### 1. Zero-Config, Browser-Based GUI (No Electron Bloat)

- When the `.exe` is double-clicked, it must automatically spin up a lightweight local HTTP server and launch the user's default web browser (Brave, Edge, Chrome) to a clean, modern web dashboard.
- **Portable & Headless by Design:** SysSentinel is a portable app — it is never "installed" and needs no admin rights to run. Only the dashboard, not a terminal, may ever be shown: the process runs with **no console/cmd window** (compile as a GUI-subsystem executable or detach/free the console at startup) and simply lives as a background process plus a system-tray icon.
- **System Tray Presence:** A tray icon appears in the Windows notification area (right-hand side of the taskbar) while the app runs. Clicking it reopens the browser dashboard at any time; a context-menu **"Exit"** action shuts the monitor down completely, so the app can always be easily turned off.
- **The Dashboard UI:**
  - **System Health Status Card:** A prominent visual indicator (Green for normal, Orange/Red for warning) showing real-time CPU load and Free RAM in plain English.
  - **Active Anomaly Feed:** Simple human-friendly cards translating technical metrics into understandable insights. Human wording is layered **on top of — never in place of — exact identifying data**: every card must state the **exact process name, its PID, and the concrete figures** behind the insight (CPU %, RAM %, and command-line path when available). A card must never merely say "something happened" without naming *what* (process + PID + numbers) triggered it. For detected scripts/popups, each card must also name **who or what ran it**: the launching parent process (name + PID), the Windows user account under which it ran, whether it appears to be a scheduled task, startup item, script host, or interactive launch, and the **exact file path of the script on disk** so the user can find and read it.
  - **Action Controls:** Clear, clickable buttons for _"Refresh Status"_, _"View History"_, _"Remove from Startup"_, and _"Clean Up"_.

### 2. System Monitoring Engine

- Poll system metrics every 5 to 10 seconds using the `systeminformation` library.
- Track and record:
  - Total and free RAM (in GB).
  - Current CPU load percentage.
  - Top resource-hogging process (Name, Process ID, CPU %, RAM %).
  - **Terminal & Script Popups:** Scan for unexpected terminal spawn events (`cmd.exe`, `powershell.exe`, `wt.exe`) to catch background popups. For each detected spawn, capture **identifying context**, not just that it happened:
    - The script's/terminal's own name, PID, and full command-line path.
    - The **exact file path** of the script on disk (resolved executable/script location), so the user can locate and read it.
    - The **parent process** that launched it (name + PID — e.g., `Taskhostw.exe`, `svchost.exe`, an app, or the user's shell).
    - The **Windows user account** it runs under.
    - The **likely trigger**: scheduled task, startup item/Run key, script host (wscript/cscript/conhost), or interactive user action — cross-referencing `schtasks`/startup sources where feasible.

### 3. Dual-Stream Logging (Human & AI Friendly)

Write logs locally to `%PROGRAMDATA%\SysSentinel\logs\` (or fallback to a local `./logs/` directory):

- **`activity.md` (Human-Friendly Log):** Clean Markdown log containing timestamps, plain-English summaries, and resource spikes.
- **`activity.jsonl` (AI-Friendly Log):** Structured JSON Lines format containing exact PIDs, command-line paths, and system health snapshots optimized for direct ingestion into an LLM for root-cause analysis. Script-spawn events must be serialized with the full forensic chain: script name/PID/cmdline, **script file path on disk**, parent process name/PID, owning user account, and detected trigger (scheduled task, startup item, script host, or interactive).

### 4. Zero-Trust Startup Control & Clean Up

Because SysSentinel is portable, "uninstall" splits into two honest, non-technical buttons on the web interface:

- **"Remove from Startup"** — shown **only when a startup registration actually exists** (never a no-op lie). A click displays a plain explanation before deleting the Windows Scheduled Task (`SysSentinelMonitor`), so background monitoring no longer auto-starts at logon. If no registration exists, the button is absent.
- **"Clean Up"** — the equivalent of removing the app "as if it was never here". A click displays a simple explanation, then kills the running monitor process and purges every local file the app created (`%PROGRAMDATA%\SysSentinel`, the `./logs/` fallback, and any other residual data), leaving **zero residual footprint**. The portable `SysSentinel.exe` itself is user-managed and is intentionally not auto-deleted.

---

## Implementation Outline (`server.js`)

The application should bundle an HTTP server using Node's built-in `http` module, serve an embedded HTML/Tailwind frontend string directly from the single file, and use the `opn` or `child_process` `start` command to open the browser automatically.

### Key Components to Implement:

1. **Express/HTTP Server:** Serves the dashboard UI on a random or fixed local port (e.g., `http://localhost:4820`).
2. **WebSocket or Polling API:** Pushes real-time CPU/RAM metrics to the frontend UI every few seconds.
3. **Task Scheduler Hook:** Handles startup/auto-start registration via `schtasks` with full transparency prompts if triggered via the UI or command-line flags.
4. **Headless & Tray Integration:** The binary must run with **no visible console** (GUI-subsystem PE or free/detach the console at startup) and must present a system-tray icon (notification area) with "Open Dashboard" and "Exit" actions so the user can always reach, reopen, and shut down the app.
5. **Standalone Packaging:** Compiled via `pkg server.js --targets node18-win-x64 --output SysSentinel.exe`.

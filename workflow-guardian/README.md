# Workflow Guardian

Standalone MVP for monitoring critical business workflows.

## v0.1

The first deploy focuses on one reliability loop:

1. Define a critical public web workflow check.
2. Replay the check manually or on a schedule.
3. Detect a broken status or missing expected text.
4. Capture evidence (status, duration, final URL, response snippet, error).
5. Surface an incident and confirm when the workflow recovers.

This MVP intentionally does **not** include login credentials, private-network targets, or arbitrary browser scripting yet. Public HTTP/HTTPS targets are validated to reduce SSRF risk.

## Run

```bash
cd workflow-guardian
npm start
```

Set `WG_DATA_DIR` to a writable persistent directory if you want state to survive restarts.

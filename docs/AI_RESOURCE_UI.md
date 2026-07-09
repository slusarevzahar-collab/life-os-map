# LifeMap AI Resource UI

This document supersedes the older multi-meter quota presentation in `docs/FRONTEND_FUNCTION_CONTRACT.md`.

User-facing rule:

- show one gauge labeled `Ресурс AI`;
- use the same aggregate cloud-pool logic in Assistant and AI Inbox;
- show one percentage and one progress bar;
- do not show model names, provider route names, requests/day, tokens/min, or route-count commentary in the normal UI;
- keep provider/model/rate-limit diagnostics available through backend status data for debugging;
- temporarily unavailable routes reduce the aggregate resource estimate;
- when exact telemetry is incomplete, prefix the estimate with `≈`;
- the gauge must never overflow the Assistant sidebar or AI Inbox header area on laptop, mobile, or Fold layouts.

Assistant sidebar should contain only:

1. compact Assistant identity;
2. the single AI resource gauge;
3. decision workflow buttons;
4. the compact `Изменения` section.

Do not restore descriptive role paragraphs, technical status summaries, active-model labels, or route telemetry explanations unless they become part of a deliberate diagnostics screen.

# Timmy AI — secure foundation (prototype)

This is a **local prototype**, not a production-ready autonomous agent. It implements a seven-role registry, source-attributed persistent SQLite memory separated by workspace, an approval request queue, and an audit log. It does **not** connect to external APIs, perform actions, encrypt data at rest, or implement authenticated users. Do not store sensitive legal, personal, or financial records until authentication, encryption, backups, and access-control tests are implemented.

## Run tests

```bash
cd timmy-ai
python -m unittest discover -s tests -v
```

## Architecture roadmap

1. Identity: OIDC, MFA, role-based access, per-workspace authorization enforced at database/API boundaries.
2. Storage: encrypted database, per-workspace key strategy, backup/restore, provenance and retention policies.
3. Agents: orchestration router with bounded context and tool permission policies for each specialty.
4. Integrations: Gmail, Calendar, Drive, GitHub and authorized computer access via scoped OAuth/tool adapters.
5. Approvals: authenticated, expiring, single-use approvals bound to exact action payload; idempotency and rollback.
6. Automations: scheduled briefings and alerts, retry/dead-letter queues, notifications and execution tracing.
7. Verification: integration, authorization, adversarial prompt-injection, and end-to-end tests before deployment.

No credentials belong in source control. Create `.env` from `.env.example` only after integrations are selected.

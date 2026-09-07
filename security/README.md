# Publisher Forge Security Gate

Security Gate is the release guard for every Publisher Forge pipeline. It orchestrates established scanners, normalizes their output, creates a fix-ready report, and blocks a proposed release when an unaccepted high or critical issue remains.

## What v1 runs

1. Node syntax and runtime security-contract tests.
2. `npm audit` for known dependency vulnerabilities.
3. Gitleaks across Git history in GitHub Actions.
4. CodeQL JavaScript analysis in GitHub Actions.
5. A passive OWASP ZAP baseline against an explicitly allowlisted staging origin.

The repository scan writes `security-artifacts/security-report.json` and `security-artifacts/fix-plan.md`. Scanner evidence is redacted before it is normalized. Critical findings cannot be waived. A high finding can be accepted only by adding its exact ID, an approver, a reason, and a future expiration date to `accepted-risks.json`.

## Local gate

Run:

```bash
npm run security:gate
```

This runs the checks available without containerized CI scanners. High and critical findings, invalid exceptions, and scanner failures return a failing exit code.

## Staging baseline

The staging workflow is disabled until both GitHub repository variables are configured:

- `SECURITY_STAGING_URL`: the HTTPS origin of a non-production Publisher Forge test service.
- `SECURITY_ALLOWED_TARGETS`: a comma-separated list of exact HTTPS origins Security Gate is authorized to scan.

The target must exactly match the allowlist. The validator rejects credentials in URLs, non-HTTPS targets, local/private addresses, and the production origins listed in `policy.json`. The ZAP workflow is passive; active scanning is intentionally not enabled in v1.

## Enforcing releases

Require both `Security Gate / Repository scan` and `Security Gate / Dependency change review` in the `main` branch ruleset. Keep production deployment tied to protected `main` so a failed gate cannot be released.

## Mobile layer

MobSF stays dormant until Publisher Forge produces an APK, AAB, or IPA. At that point, add MobSF static analysis for every build, run dynamic analysis only in an isolated emulator environment, and map findings to OWASP MASVS/MASTG v2 controls.

## Safe testing rule

Do not aim ZAP, MobSF dynamic analysis, or any active security tool at a system unless its owner has explicitly authorized that exact target. Never use Publisher Forge to scan arbitrary third-party services.

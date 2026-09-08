# Publisher Forge persistent account storage

Publisher Forge now includes account-backed state storage using Node's built-in SQLite support.

## Production setup

1. Attach a persistent disk to the Publisher Forge service.
2. Mount it at a writable path such as `/var/data`.
3. Set `PF_DATA_DIR=/var/data` in the service environment.
4. Redeploy.
5. Open `/account`. The storage banner should say that persistent account storage is configured.

You may instead set `PF_DB_PATH` to a complete database file path on a persistent volume.

If neither variable is configured, Forge deliberately reports `ephemeral-file` storage. Accounts will function for testing, but the database may disappear on a redeploy and should not be relied on for production.

## What is synchronized

- Project Vault (`pfProjectVault`)
- Revenue Agent history (`pfRevenueTests`)
- Opportunity Agent results
- Money Agent settings
- latest Command Center company plan

State writes use revision numbers. If another device changed the account copy, Forge returns a conflict instead of silently overwriting the newer data.

## Security defaults

- passwords are salted and hashed with scrypt
- raw passwords are never stored
- login sessions use random server-side tokens
- only a SHA-256 hash of each session token is stored in the database
- browser cookies are HttpOnly and SameSite=Lax, and Secure in production
- account writes reject cross-origin browser requests
- authentication and sync endpoints are rate limited
- external publishing, job applications, posting, and spending remain human-approval protected

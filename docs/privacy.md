# Privacy and Retention

ATTACHED is designed as a local-first workflow. Sensitive data is captured and processed on the workstation rather than sent to a central application backend.

## Consent

The assessment flow requires consent before recording can proceed.

The consent flow is part of the session state and is stored with:

- consent status
- consent version
- consent timestamp
- revocation timestamp

## Data deletion controls

The app supports several cleanup actions:

- delete recordings while keeping assessment details
- delete a full session and its artifacts
- reset all local app data from the profile/settings flow

These actions remove both database records and filesystem artifacts where applicable.

## Local data reset

A full local reset clears:

- sessions
- users
- app state
- audit events
- per-session working directories
- mirrored recording artifacts
- participant-test mirrors
- training reports

The local admin account is then recreated automatically.

## Retention behavior

The backend automatically prunes non-active sessions older than:

```text
365 days
```

Active sessions are excluded from automatic pruning.

## Best-effort cleanup

After destructive operations, the backend attempts to:

- remove files from disk
- vacuum the SQLite database

This is a best-effort privacy cleanup, not a forensic erasure guarantee.

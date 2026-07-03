# Storage Layout

ATTACHED stores data in two places:

- Electron user-data storage
- repo-local artifact mirrors under `web/artifacts/`

## Electron user-data root

The backend stores its main working data under:

```text
app.getPath('userData')/attached-local
```

This root contains:

- `attached-local.db`
  - SQLite database for users, sessions, app state, and audit events
- `sessions/<session-id>/raw/exposure/`
- `sessions/<session-id>/raw/response-video/`
- `sessions/<session-id>/raw/audio/`
- `sessions/<session-id>/input/quiz.csv`
- `sessions/<session-id>/model-output/`

## Repo-local artifact mirrors

The backend also mirrors files into the repo for easier inspection and export:

- `web/artifacts/recordings/<session-label>/stimulus-XX/`
  - mirrored exposure, response-video, and response-audio files
- `web/artifacts/participant-tests/<participant-key>/<session-id>/`
  - participant-oriented mirrors of session capture files
- `web/artifacts/training-reports/<session-id>.json`
- `web/artifacts/training-reports/<session-id>.csv`

## Database tables

The local SQLite database creates these tables:

- `users`
- `app_state`
- `sessions`
- `audit_events`

## Session deletion behavior

When a full session is deleted, the backend removes:

- the SQLite session record
- the per-session working directory
- mirrored recording artifacts
- participant-test mirrors
- generated training reports

See [Privacy and Retention](./privacy.md) for lifecycle and cleanup rules.

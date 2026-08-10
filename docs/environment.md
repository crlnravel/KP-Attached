# Environment Variables

ATTACHED reads a mix of build-time and runtime environment variables.

## `.env`-based configuration

The checked-in [`.env.example`](../.env.example) documents the main app-level configuration used during development:

```dotenv
DEBUG=false
ATTACHED_REMOTE_AUTH_REQUEST_URL=
ATTACHED_REMOTE_AUTH_SIGN_IN_URL=
ATTACHED_REMOTE_AUTH_TIMEOUT_MS=15000

# Required for local admin bootstrap. Keep the actual value out of source control.
ATTACHED_ADMIN_PASSWORD=
```

Use these to:

- enable debug helpers
- configure remote access-request submission
- configure remote approval-status sync

## Runtime overrides

The backend also reads these runtime variables:

| Variable                         | Purpose                                                                                       |
| -------------------------------- | --------------------------------------------------------------------------------------------- |
| `ATTACHED_ADMIN_EMAIL`           | Override the default local admin email.                                                       |
| `ATTACHED_ADMIN_PASSWORD`        | Required secret for bootstrapping the local admin; there is no default.                       |
| `ATTACHED_MODEL_ROOT`            | Absolute path to `attached-inference-runtime` when it is not in the default sibling location. |
| `ATTACHED_PROJECT_ROOT`          | Override project-root detection used to locate `attached-inference-runtime`.                  |
| `ATTACHED_SAMPLE_DATA_DIR`       | Absolute path to the Nabila fixture directory.                                                |
| `ATTACHMENT_PYTHON`              | Override the Python interpreter used for the main attachment pipeline environment.            |
| `MMACTION_PYTHON`                | Override the Python interpreter used for the MMACTION environment.                            |
| `ATTACHED_SMOKE_TEST`            | Internal flag for smoke-test mode.                                                            |
| `ATTACHED_SMOKE_TEST_EMAIL`      | Approved psychologist email used by the Electron smoke test.                                  |
| `ATTACHED_SMOKE_TEST_PASSWORD`   | Approved psychologist password used by the Electron smoke test.                               |
| `ATTACHED_SMOKE_TEST_TIMEOUT_MS` | Optional timeout override for the smoke test.                                                 |

## Notes

- `DEBUG=true` also affects approval behavior in development by enabling local auto-approval shortcuts.
- Remote approval URLs are optional. Without them, the app still supports local admin approval.

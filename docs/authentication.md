# Authentication and Approval Flow

ATTACHED has a local account system with two roles:

- `admin`
- `psychologist`

## Local admin bootstrap

On startup, the backend ensures that one local admin account exists.

The local admin account is bootstrapped on the first startup with:

- email: `admin@attached.local`
- password: the value of `ATTACHED_ADMIN_PASSWORD`

There is no built-in password. Set `ATTACHED_ADMIN_PASSWORD` to a unique local secret before starting the app.

The email can be overridden with:

- `ATTACHED_ADMIN_EMAIL`

## Psychologist onboarding

Psychologist accounts begin as access requests, not immediately usable accounts.

The request includes:

- email and password
- legal and professional identity details
- license information
- practice information
- uploaded verification documents

## Approval paths

### Local admin review

Without remote endpoints, the app supports a local approval flow:

1. psychologist submits request
2. local admin signs in
3. admin reviews documents and profile details
4. admin approves or rejects the request

Only approved psychologist accounts can sign in to the dashboard and run assessments.

### Optional remote approval sync

If remote approval endpoints are configured, the app can:

- submit access requests to a remote service
- refresh approval status during sign-in for pending accounts

This is optional. The app still works as a fully local workflow without remote services.

## Sign-in behavior

- Admin accounts can access the admin surface only.
- Psychologist accounts can access the dashboard and assessment flow only after approval.
- Rejected accounts must update credentials/details and resubmit.
- Pending accounts are blocked until approved.

## Related docs

- [Environment Variables](./environment.md)
- [Privacy and Retention](./privacy.md)

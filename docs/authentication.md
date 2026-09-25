# Authentication

The public API is planned to support API-key authentication.

Secrets are server-side only.

Rules:

- Never expose provider credentials to Kinoma.
- Never log API keys or authorization headers.
- API keys should be rotatable.
- Authentication failures use standardized error responses.
- Internal admin operations use stronger authentication than public API access.

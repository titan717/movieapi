# Authentication

Phase 1 implements the API-key authentication foundation.

Set MOVIEAPI_AUTH_REQUIRED=true and configure MOVIEAPI_API_KEYS as a comma-separated list.

Clients then send:

    X-API-Key: key-one

If authentication is required without configured keys, the application fails startup instead of running in an accidentally unsecured configuration.

Provider credentials remain server-side secrets and are never returned to Kinoma or logged.

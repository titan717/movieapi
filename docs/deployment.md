# Deployment

MovieApi is intended to deploy to Vercel.

Production deployment must keep provider secrets in environment variables and must not commit credentials.

Deployment verification will include:

- Build succeeds
- Health endpoint responds
- OpenAPI/docs are accessible
- Environment configuration is validated
- Tests pass
- No secrets are present in repository files

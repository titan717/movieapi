# Errors

## Public error format

```json
{
  "success": false,
  "error": {
    "code": "PROVIDER_TIMEOUT",
    "message": "The provider did not respond in time.",
    "requestId": "req_abc123"
  }
}
```

## Provider errors

- PROVIDER_TIMEOUT
- PROVIDER_RATE_LIMITED
- PROVIDER_UNAVAILABLE
- PROVIDER_INVALID_RESPONSE

## Media errors

- MEDIA_NOT_FOUND
- EPISODE_NOT_FOUND
- INVALID_MEDIA_ID

## Playback errors

- SOURCE_UNAVAILABLE
- SOURCE_TIMEOUT
- SOURCE_INVALID
- SOURCE_RATE_LIMITED
- SOURCE_EXPIRED
- SOURCE_NOT_FOUND
- SOURCE_INCOMPATIBLE

## Request/auth errors

- INVALID_REQUEST
- UNAUTHORIZED
- FORBIDDEN
- RATE_LIMITED
- INTERNAL_ERROR

# VidSrc Provider

VidSrc is planned as a playback provider.

## Integration principle

MovieApi will use the provider's documented/public integration surface first. It will not depend on reverse-engineered player internals when a supported interface is available.

The current integration target is the documented VidSrc API/interface at https://vidsrc.mov/.

## Identifier flow

```
Kinoma media ID
  |
  v
MovieApi identity mapping
  |
  +--> TMDB ID
  +--> IMDb ID
  |
  v
VidSrc playback resolution
```

For TV playback, the resolved show identifier is combined with season and episode numbers.

## Playback vs availability

Availability data indicates that a title/episode is listed by a provider. It does not guarantee that live playback will succeed.

MovieApi will perform live playback resolution separately.

## Validation

A VidSrc response must be validated before it becomes a playback response.

Possible normalized source errors:

- SOURCE_UNAVAILABLE
- SOURCE_TIMEOUT
- SOURCE_INVALID
- SOURCE_RATE_LIMITED
- SOURCE_EXPIRED
- SOURCE_NOT_FOUND
- SOURCE_INCOMPATIBLE

## Safety boundary

MovieApi will not bypass DRM, authentication, CAPTCHA, access controls, protected keys, or other technical restrictions. If a provider requires an incompatible webpage/player flow, MovieApi reports the source as incompatible rather than attempting to circumvent it.

## Documentation source

Official/current provider documentation: https://vidsrc.mov/

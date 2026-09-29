# PixKit image-generation API

PixKit uses one browser-facing endpoint and keeps provider credentials on the server.

## Provider-neutral architecture

The frontend calls:

- `POST /api/generate-image`

with:

```json
{ "prompt": "...", "quality": "low", "provider": "auto" }
```

The server chooses an image engine. The frontend does not need to know which model is running.

## Provider 1: OpenAI

Set:

- `PIXKIT_IMAGE_PROVIDER=openai`
- `OPENAI_API_KEY=your_key`
- Optional: `PIXKIT_OPENAI_IMAGE_MODEL=gpt-image-2`

## Provider 2: PixKit self-hosted engine

Set:

- `PIXKIT_IMAGE_PROVIDER=self_hosted`
- `PIXKIT_SELF_HOSTED_IMAGE_URL=https://your-gpu-server.example.com/generate`
- Optional: `PIXKIT_SELF_HOSTED_IMAGE_TOKEN=...`

The self-hosted endpoint should accept:

```json
{ "prompt": "...", "quality": "low" }
```

and return:

```json
{ "image": "data:image/jpeg;base64,..." }
```

This contract lets us put an open-weight model such as FLUX or Qwen Image behind PixKit without changing the website UI.

If `PIXKIT_IMAGE_PROVIDER=auto`, PixKit prefers the self-hosted engine when it is configured and otherwise uses OpenAI.

## Security

- Never put provider keys in `index.html`, `story.js`, or other browser-side JavaScript.
- `PIXKIT_ALLOWED_ORIGINS` controls which browser origins may call the endpoint.
- Origin checking is not a substitute for rate limiting.
- Before public launch, add server-side rate limits and usage controls.

## Deployment

For the current serverless deployment, deploy the repository to Vercel and configure the environment variables in the deployment settings.

For the self-hosted engine, the GPU service can be deployed separately. PixKit only needs its HTTPS generation endpoint.

## Roadmap

1. Keep the current Story → Scenes UI.
2. Add a self-hosted GPU endpoint implementing the small provider contract above.
3. Start with an open-weight image model.
4. Add character/scene consistency controls.
5. Later add voice timing and video generation.

## AI story analyzer

Story → Scenes can optionally call:

- `POST /api/analyze-story`

The analyzer uses the server-side `OPENAI_API_KEY` and returns structured story data for characters, locations, world continuity and scene planning.

Optional environment variable:

- `PIXKIT_STORY_MODEL=gpt-5.6-luna`

The browser never receives the OpenAI key. If story analysis is unavailable, the Story → Scenes UI falls back to local continuity rules.

The analyzer request uses `store: false` so the application does not ask the Responses API to store the response. OpenAI's current Responses API supports structured JSON output through `text.format.type=json_schema`.

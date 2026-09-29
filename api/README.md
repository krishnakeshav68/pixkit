# PixKit image-generation API

This endpoint keeps the image-provider API key off the browser.

## Deploy

Deploy the repository to Vercel and add these environment variables:

- `OPENAI_API_KEY` = your OpenAI API key
- `PIXKIT_ALLOWED_ORIGINS` = `https://pixkit.world,https://www.pixkit.world`

For local development, you can also include `http://localhost:3000` and `http://localhost:5173`.

The frontend calls:

- `POST /api/generate-image`

with:

```json
{ "prompt": "...", "quality": "low" }
```

The endpoint returns a JPEG data URL.

The first MVP intentionally defaults to low-quality landscape images to keep generation cost down. OpenAI's current image API supports landscape generation and configurable quality; higher quality generally costs more.

Do not put `OPENAI_API_KEY` in `index.html`, `story.js`, or any browser-side JavaScript.

Before opening the feature to heavy public traffic, add proper rate limiting/usage controls at the API layer. Origin checking reduces casual cross-site abuse but is not a substitute for server-side rate limiting.

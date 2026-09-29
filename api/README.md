# PixKit image-generation API

This endpoint keeps the image-provider API key off the browser.

## Deploy

Deploy the repository to Vercel and add an environment variable:

- `OPENAI_API_KEY` = your OpenAI API key

The frontend calls:

- `POST /api/generate-image`

with:

```json
{ "prompt": "...", "quality": "low" }
```

The endpoint returns a JPEG data URL.

Do not put `OPENAI_API_KEY` in `index.html`, `story.js`, or any browser-side JavaScript.

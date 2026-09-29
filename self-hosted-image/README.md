# PixKit self-hosted image engine

This service is the first reference implementation for PixKit's provider-neutral image engine.

It exposes:

- `GET /health`
- `POST /generate`

The generation contract is:

```json
{
  "prompt": "A photorealistic cinematic scene...",
  "quality": "low"
}
```

Response:

```json
{
  "image": "data:image/jpeg;base64,...",
  "model": "black-forest-labs/FLUX.1-schnell"
}
```

## Model

The default model is **FLUX.1-schnell**. Its Hugging Face model card identifies it as Apache 2.0 and documents Diffusers usage. It is intended for fast generation with 1–4 inference steps.

The model is downloaded the first time the service starts generating an image, so the GPU machine needs sufficient disk space and network access during initial setup.

## GPU server

This service is intended to run on a machine with an NVIDIA GPU and CUDA. The included Dockerfile uses an NVIDIA CUDA runtime image.

Your 8 GB RAM personal computer does not need to run this service. PixKit's Vercel function calls this service server-to-server.

## Run locally on a suitable NVIDIA GPU machine

1. Copy `.env.example` to `.env`.
2. Set a strong `PIXKIT_ENGINE_TOKEN`.
3. Install dependencies:

```bash
python3 -m pip install -r requirements.txt
```

4. Start the service:

```bash
uvicorn app:app --host 0.0.0.0 --port 8000
```

5. Test:

```bash
curl http://localhost:8000/health
```

Generation requires:

```bash
curl -X POST http://localhost:8000/generate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"A photorealistic cinematic camel walking through a desert at sunrise","quality":"low"}'
```

## Connect to PixKit

Set these Vercel environment variables:

- `PIXKIT_IMAGE_PROVIDER=self_hosted`
- `PIXKIT_SELF_HOSTED_IMAGE_URL=https://YOUR_GPU_HOST/generate`
- `PIXKIT_SELF_HOSTED_IMAGE_TOKEN=YOUR_TOKEN`
- `PIXKIT_ALLOWED_ORIGINS=https://pixkit.world,https://www.pixkit.world`

Do not expose the engine token to browser JavaScript.

## Next improvements

- Add a job queue so multiple story scenes do not compete for one GPU.
- Add persistent model warm-up and generation metrics.
- Add image storage rather than returning large base64 responses.
- Add character-reference conditioning/LoRA support.
- Add a second model adapter so FLUX and Qwen can be compared without changing PixKit's API.

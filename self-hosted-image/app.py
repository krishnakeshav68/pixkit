import base64
import io
import os
from functools import lru_cache

import torch
from diffusers import FluxPipeline
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from PIL import Image

app = FastAPI(title="PixKit Self-Hosted Image Engine", version="0.1.0")


class GenerateRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=8000)
    quality: str = Field(default="low")


def require_token(authorization: str | None) -> None:
    expected = os.getenv("PIXKIT_ENGINE_TOKEN", "").strip()
    if not expected:
        raise HTTPException(status_code=500, detail="PIXKIT_ENGINE_TOKEN is not configured.")

    provided = (authorization or "").removeprefix("Bearer ").strip()
    if not provided or provided != expected:
        raise HTTPException(status_code=401, detail="Unauthorized.")


@lru_cache(maxsize=1)
def get_pipeline() -> FluxPipeline:
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA GPU is required for the self-hosted image engine.")

    model_id = os.getenv("MODEL_ID", "black-forest-labs/FLUX.1-schnell")
    pipe = FluxPipeline.from_pretrained(
        model_id,
        torch_dtype=torch.bfloat16,
    )
    pipe.enable_model_cpu_offload()
    return pipe


@app.get("/health")
def health():
    return {
        "ok": True,
        "cuda": torch.cuda.is_available(),
        "model": os.getenv("MODEL_ID", "black-forest-labs/FLUX.1-schnell"),
    }


@app.post("/generate")
def generate(request: GenerateRequest, authorization: str | None = Header(default=None)):
    require_token(authorization)

    try:
        pipe = get_pipeline()

        # FLUX.1-schnell is designed for a small number of inference steps.
        image = pipe(
            prompt=request.prompt,
            num_inference_steps=4,
            guidance_scale=0.0,
            width=1024,
            height=1024,
        ).images[0]

        output = io.BytesIO()
        image.save(output, format="JPEG", quality=85, optimize=True)
        encoded = base64.b64encode(output.getvalue()).decode("ascii")

        return {
            "image": f"data:image/jpeg;base64,{encoded}",
            "model": os.getenv("MODEL_ID", "black-forest-labs/FLUX.1-schnell"),
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Generation failed: {exc}") from exc

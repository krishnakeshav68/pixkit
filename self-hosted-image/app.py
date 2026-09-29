import base64
import io
import os
from functools import lru_cache

import torch
from diffusers import FluxPipeline
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from PIL import Image

app = FastAPI(title="PixKit Self-Hosted Image Engine", version="0.2.0")


class GenerateRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=8000)
    quality: str = Field(default="low")
    referenceImages: list[str] = Field(default_factory=list, max_length=16)


def require_token(authorization: str | None) -> None:
    expected = os.getenv("PIXKIT_ENGINE_TOKEN", "").strip()
    if not expected:
        raise HTTPException(status_code=500, detail="PIXKIT_ENGINE_TOKEN is not configured.")

    provided = (authorization or "").removeprefix("Bearer ").strip()
    if not provided or provided != expected:
        raise HTTPException(status_code=401, detail="Unauthorized.")


def decode_image(data_url: str) -> Image.Image:
    if not data_url.startswith("data:image/"):
        raise ValueError("Reference image must be a data URL.")

    try:
        _, encoded = data_url.split(",", 1)
        raw = base64.b64decode(encoded, validate=True)
        image = Image.open(io.BytesIO(raw)).convert("RGB")
        image.thumbnail((1536, 1536), Image.Resampling.LANCZOS)
        return image
    except Exception as exc:
        raise ValueError("Invalid reference image.") from exc


@lru_cache(maxsize=1)
def get_pipeline() -> FluxPipeline:
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA GPU is required for the self-hosted image engine.")

    model_id = os.getenv("MODEL_ID", "black-forest-labs/FLUX.1-schnell")
    pipe = FluxPipeline.from_pretrained(
        model_id,
        torch_dtype=torch.bfloat16,
    )

    adapter_id = os.getenv("IP_ADAPTER_ID", "").strip()
    adapter_weight = os.getenv("IP_ADAPTER_WEIGHT", "").strip()
    adapter_image_encoder = os.getenv("IP_ADAPTER_IMAGE_ENCODER", "").strip()

    if adapter_id:
        if not adapter_weight:
            raise RuntimeError("IP_ADAPTER_WEIGHT is required when IP_ADAPTER_ID is configured.")

        kwargs = {
            "weight_name": adapter_weight,
        }
        if adapter_image_encoder:
            kwargs["image_encoder_pretrained_model_name_or_path"] = adapter_image_encoder

        pipe.load_ip_adapter(adapter_id, **kwargs)
        pipe.set_ip_adapter_scale(float(os.getenv("IP_ADAPTER_SCALE", "0.65")))

    pipe.enable_model_cpu_offload()
    return pipe


@app.get("/health")
def health():
    return {
        "ok": True,
        "cuda": torch.cuda.is_available(),
        "model": os.getenv("MODEL_ID", "black-forest-labs/FLUX.1-schnell"),
        "referenceConditioning": bool(os.getenv("IP_ADAPTER_ID", "").strip()),
    }


@app.post("/generate")
def generate(request: GenerateRequest, authorization: str | None = Header(default=None)):
    require_token(authorization)

    try:
        references = [decode_image(value) for value in request.referenceImages]

        if references and not os.getenv("IP_ADAPTER_ID", "").strip():
            raise HTTPException(
                status_code=400,
                detail="Reference images were supplied, but IP-Adapter is not configured on this self-hosted engine."
            )

        pipe = get_pipeline()

        kwargs = {
            "prompt": request.prompt,
            "num_inference_steps": 4,
            "guidance_scale": 0.0,
            "width": 1024,
            "height": 1024,
        }

        if references:
            kwargs["ip_adapter_image"] = references

        image = pipe(**kwargs).images[0]

        output = io.BytesIO()
        image.save(output, format="JPEG", quality=85, optimize=True)
        encoded = base64.b64encode(output.getvalue()).decode("ascii")

        return {
            "image": f"data:image/jpeg;base64,{encoded}",
            "model": os.getenv("MODEL_ID", "black-forest-labs/FLUX.1-schnell"),
            "referenceConditioning": bool(references),
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Generation failed: {exc}") from exc

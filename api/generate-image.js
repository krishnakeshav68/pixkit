const PROVIDERS = {
  openai: {
    envKey: "OPENAI_API_KEY",
    async generate({ prompt, quality, referenceImages }) {
      if (referenceImages?.length) {
        const form = new FormData();
        form.append("model", process.env.PIXKIT_OPENAI_IMAGE_MODEL || "gpt-image-2");
        form.append("prompt", prompt);
        form.append("size", "1536x1024");
        form.append("quality", quality);
        form.append("output_format", "jpeg");
        form.append("output_compression", "80");

        referenceImages.slice(0, 16).forEach((dataUrl, index) => {
          const match = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(dataUrl || "");
          if (!match) return;
          const bytes = Buffer.from(match[2], "base64");
          const blob = new Blob([bytes], { type: match[1] });
          form.append("image[]", blob, `reference-${index + 1}.${match[1] === "image/png" ? "png" : match[1] === "image/webp" ? "webp" : "jpg"}`);
        });

        const response = await fetch("https://api.openai.com/v1/images/edits", {
          method: "POST",
          headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}` },
          body: form
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error?.message || "OpenAI image edit failed.");
        const image = data?.data?.[0];
        if (!image?.b64_json) throw new Error("The image provider returned no image.");
        return `data:image/jpeg;base64,${image.b64_json}`;
      }

      const response = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: process.env.PIXKIT_OPENAI_IMAGE_MODEL || "gpt-image-2",
          prompt,
          size: "1536x1024",
          quality,
          output_format: "jpeg",
          output_compression: 80
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error?.message || "OpenAI image generation failed.");
      }

      const image = data?.data?.[0];
      if (!image?.b64_json) throw new Error("The image provider returned no image.");
      return `data:image/jpeg;base64,${image.b64_json}`;
    }
  },

  self_hosted: {
    envKey: "PIXKIT_SELF_HOSTED_IMAGE_URL",
    async generate({ prompt, quality, referenceImages }) {
      const endpoint = process.env.PIXKIT_SELF_HOSTED_IMAGE_URL;
      const token = process.env.PIXKIT_SELF_HOSTED_IMAGE_TOKEN || "";

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ prompt, quality, referenceImages: referenceImages || [] })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || data?.detail || "Self-hosted image generation failed.");
      }

      if (!data?.image) throw new Error("The self-hosted provider returned no image.");
      return data.image;
    }
  }
};

function allowedOrigins() {
  return (process.env.PIXKIT_ALLOWED_ORIGINS ||
    "https://pixkit.world,https://www.pixkit.world,http://localhost:3000,http://localhost:5173")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);
}

function chooseProvider(requested) {
  const mode = (requested || process.env.PIXKIT_IMAGE_PROVIDER || "auto").toLowerCase();

  if (mode === "self_hosted") {
    if (process.env.PIXKIT_SELF_HOSTED_IMAGE_URL) return "self_hosted";
    throw new Error("Self-hosted image generation is not configured.");
  }

  if (mode === "openai") {
    if (process.env.OPENAI_API_KEY) return "openai";
    throw new Error("OpenAI image generation is not configured.");
  }

  if (process.env.PIXKIT_SELF_HOSTED_IMAGE_URL) return "self_hosted";
  if (process.env.OPENAI_API_KEY) return "openai";
  throw new Error("No image-generation provider is configured.");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const origin = req.headers.origin || "";
  if (!allowedOrigins().includes(origin)) {
    return res.status(403).json({ error: "This image-generation endpoint is not available from this origin." });
  }

  try {
    const body = req.body || {};
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const referenceImages = Array.isArray(body.referenceImages) ? body.referenceImages.filter(value => typeof value === "string" && value.length <= 5_000_000).slice(0, 16) : [];
    const quality = ["low", "medium", "high"].includes(body.quality) ? body.quality : "low";
    const provider = chooseProvider(typeof body.provider === "string" ? body.provider : "auto");

    if (!prompt) return res.status(400).json({ error: "A prompt is required." });
    if (prompt.length > 8000) return res.status(400).json({ error: "Prompt is too long." });

    const image = await PROVIDERS[provider].generate({ prompt, quality, referenceImages });
    return res.status(200).json({ image, provider });
  } catch (error) {
    const message = error?.message || "Unable to generate the image right now.";
    const configurationError = /not configured|No image-generation provider/.test(message);
    return res.status(configurationError ? 500 : 502).json({ error: message });
  }
}

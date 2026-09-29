export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "Image generation is not configured on the server." });
  }

  try {
    const body = req.body || {};
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const quality = ["low", "medium", "high"].includes(body.quality) ? body.quality : "low";

    if (!prompt) {
      return res.status(400).json({ error: "A prompt is required." });
    }
    if (prompt.length > 8000) {
      return res.status(400).json({ error: "Prompt is too long." });
    }

    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-image-2",
        prompt,
        size: "1536x1024",
        quality,
        output_format: "jpeg",
        output_compression: 80
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.error?.message || "Image generation failed."
      });
    }

    const image = data?.data?.[0];
    if (!image?.b64_json) {
      return res.status(502).json({ error: "The image provider returned no image." });
    }

    return res.status(200).json({
      image: `data:image/jpeg;base64,${image.b64_json}`
    });
  } catch (error) {
    return res.status(500).json({ error: "Unable to generate the image right now." });
  }
}

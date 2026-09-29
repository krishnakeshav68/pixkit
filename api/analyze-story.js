const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    characters: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          species: { type: "string" },
          age: { type: "string" },
          appearance: { type: "string" },
          clothing: { type: "string" },
          personality: { type: "string" },
          continuity: { type: "string" }
        },
        required: ["id","name","species","age","appearance","clothing","personality","continuity"]
      }
    },
    locations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          description: { type: "string" },
          continuity: { type: "string" }
        },
        required: ["id","name","description","continuity"]
      }
    },
    world: {
      type: "object",
      additionalProperties: false,
      properties: {
        setting: { type: "string" },
        timePeriod: { type: "string" },
        season: { type: "string" },
        weather: { type: "string" },
        visualRules: { type: "array", items: { type: "string" } }
      },
      required: ["setting","timePeriod","season","weather","visualRules"]
    },
    scenes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          number: { type: "integer" },
          narration: { type: "string" },
          characters: { type: "array", items: { type: "string" } },
          location: { type: "string" },
          action: { type: "string" },
          visualDirection: { type: "string" }
        },
        required: ["number","narration","characters","location","action","visualDirection"]
      }
    }
  },
  required: ["title","summary","characters","locations","world","scenes"]
};

function allowedOrigins() {
  return (process.env.PIXKIT_ALLOWED_ORIGINS ||
    "https://pixkit.world,https://www.pixkit.world,http://localhost:3000,http://localhost:5173")
    .split(",").map(value => value.trim()).filter(Boolean);
}

function extractOutputText(data) {
  if (typeof data?.output_text === "string") return data.output_text;
  const parts = [];
  for (const item of data?.output || []) {
    for (const part of item?.content || []) {
      if (part?.type === "output_text" && typeof part.text === "string") parts.push(part.text);
    }
  }
  return parts.join("");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const origin = req.headers.origin || "";
  if (!allowedOrigins().includes(origin)) {
    return res.status(403).json({ error: "This story-analysis endpoint is not available from this origin." });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "Story analysis is not configured." });
  }

  try {
    const body = req.body || {};
    const story = typeof body.story === "string" ? body.story.trim() : "";
    const style = typeof body.style === "string" ? body.style.trim() : "realistic cinematic";
    const requestedScenes = ["auto", "4", "6", "8"].includes(String(body.sceneCount))
      ? String(body.sceneCount) : "auto";

    if (!story) return res.status(400).json({ error: "A story is required." });
    if (story.length > 30000) return res.status(400).json({ error: "Story is too long." });

    const system = [
      "You are PixKit's story-to-visual planning engine.",
      "Analyze the supplied story for a realistic cinematic image/video workflow.",
      "Preserve facts from the story and do not invent major plot events.",
      "Identify recurring characters even when they are unnamed. Give unnamed recurring characters stable descriptive names.",
      "For animals, describe species, realistic anatomy, age, coat/fur/skin colors and distinctive markings.",
      "For people, describe age range, hair, face, build, clothing and distinctive features.",
      "Create a continuity bible: the same character must retain the same appearance, proportions, clothing/accessories and identity in every scene.",
      "Identify recurring locations and world rules. Keep geography, season, weather and time-of-day coherent.",
      "Break the story into chronological visual scenes. Each scene should describe a single strong cinematic moment.",
      "The requested scene count is a preference, not permission to remove important story events.",
      "Return only the requested structured data."
    ].join(" ");

    const user = [
      "Visual style: " + style,
      "Requested scene count: " + requestedScenes,
      "Story:",
      story
    ].join("\n\n");

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.PIXKIT_STORY_MODEL || "gpt-5.6-luna",
        store: false,
        input: [
          { role: "system", content: system },
          { role: "user", content: user }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "pixkit_story_analysis",
            strict: true,
            schema: SCHEMA
          }
        }
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error?.message || "Story analysis failed.");
    }

    const raw = extractOutputText(data);
    if (!raw) throw new Error("The story analyzer returned no result.");

    let analysis;
    try {
      analysis = JSON.parse(raw);
    } catch (_) {
      throw new Error("The story analyzer returned invalid structured data.");
    }

    return res.status(200).json({
      analysis,
      model: process.env.PIXKIT_STORY_MODEL || "gpt-5.6-luna"
    });
  } catch (error) {
    return res.status(502).json({ error: error?.message || "Unable to analyze the story right now." });
  }
}

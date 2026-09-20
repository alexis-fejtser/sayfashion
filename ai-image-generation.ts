import { z } from "zod";

const imageResponseSchema = z.object({
  data: z.array(z.object({ url: z.string().optional(), b64_json: z.string().optional() })),
});

const imageModelsResponseSchema = z.object({
  data: z.array(z.object({
    id: z.string(),
    architecture: z.object({ input_modalities: z.array(z.string()), output_modalities: z.array(z.string()) }),
  })),
});

const preferredImageModels = [
  "google/gemini-3.1-flash-image",
  "google/gemini-3.1-flash-lite-image",
  "google/gemini-3-pro-image",
  "bytedance-seed/seedream-5-0-pro",
];

let modelCache: { requested: string; resolved: string; expiresAt: number } | null = null;

export interface OpenRouterImageInput {
  prompt: string;
  model: string;
  /** Signed HTTPS URLs or data: URLs for reference images */
  inputReferences?: string[];
  count?: number;
}

export interface OpenRouterImageResult { url?: string; base64?: string }

function toInputReferenceParts(urls: string[]) {
  return urls.map((url) => ({ type: "image_url" as const, image_url: { url } }));
}

function mapImageResults(data: z.infer<typeof imageResponseSchema>["data"]): OpenRouterImageResult[] {
  return data.map((image): OpenRouterImageResult => {
    if (image.url) return { url: image.url };
    if (image.b64_json) return { base64: image.b64_json };
    throw new Error("OpenRouter вернул изображение без URL/base64");
  });
}

async function requestOneImage(input: { apiKey: string; model: string; prompt: string; inputReferences: string[] }): Promise<OpenRouterImageResult> {
  const response = await fetch("https://openrouter.ai/api/v1/images", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
      ...(process.env.NEXT_PUBLIC_APP_URL ? { "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL } : {}),
      "X-Title": "SAY Fashion Admin",
    },
    body: JSON.stringify({
      model: input.model,
      prompt: input.prompt,
      n: 1,
      resolution: "1K",
      aspect_ratio: "4:5",
      input_references: toInputReferenceParts(input.inputReferences),
    }),
  });
  if (!response.ok) throw new Error(`OpenRouter ${response.status}: ${(await response.text()).slice(0, 400)}`);
  const parsed = imageResponseSchema.parse(await response.json());
  const [image] = mapImageResults(parsed.data);
  if (!image) throw new Error("OpenRouter вернул пустой data[]");
  return image;
}

async function resolveImageModel(apiKey: string, requested: string) {
  if (modelCache?.requested === requested && modelCache.expiresAt > Date.now()) return modelCache.resolved;
  const aliases: Record<string, string> = {
    "google/gemini-2.5-flash-image-preview": "google/gemini-3.1-flash-image",
  };
  const normalized = aliases[requested] || requested;
  try {
    const response = await fetch("https://openrouter.ai/api/v1/images/models", {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const models = imageModelsResponseSchema.parse(await response.json()).data.filter((model) =>
      model.architecture.input_modalities.includes("image") && model.architecture.output_modalities.includes("image"),
    );
    const available = new Set(models.map((model) => model.id));
    const resolved = available.has(normalized)
      ? normalized
      : preferredImageModels.find((model) => available.has(model));
    if (!resolved) throw new Error("Нет доступной image-to-image модели");
    modelCache = { requested, resolved, expiresAt: Date.now() + 10 * 60_000 };
    return resolved;
  } catch (error) {
    console.warn("OpenRouter model discovery failed, using current default", error);
    return normalized;
  }
}

export async function generateOpenRouterImages(input: OpenRouterImageInput) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY не настроен");
  const count = Math.min(Math.max(input.count ?? 2, 1), 4);
  const model = await resolveImageModel(apiKey, input.model);
  const variations = [
    "Front three-quarter view, relaxed natural pose, medium-full shot.",
    "Straight front view, clean confident pose, full-body fashion catalogue shot.",
    "Three-quarter side view showing the garment silhouette and fit, medium-full shot.",
    "Editorial walking pose, subtle movement, full-body fashion ecommerce shot.",
  ];
  return Promise.all(Array.from({ length: count }, (_, index) => requestOneImage({
    apiKey,
    model,
    prompt: `${input.prompt} ${variations[index]}`,
    inputReferences: input.inputReferences ?? [],
  })));
}

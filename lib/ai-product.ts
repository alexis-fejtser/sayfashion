import { z } from "zod";
import { generateOpenRouterImages } from "@/ai-image-generation";

const productDraftSchema = z.object({
  title: z.string(),
  description: z.string(),
  category: z.string(),
  suggestedPrice: z.number(),
  colors: z.array(z.string()),
  sizes: z.array(z.string()),
  imagePrompt: z.string(),
});

export async function createProductDraftFromPhoto(dataUrl: string, requestedCount = 2, customPrompt = "") {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY не настроен");

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(process.env.NEXT_PUBLIC_APP_URL ? { "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL } : {}),
      "X-Title": "Say Fashion Admin",
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_VISION_MODEL || "google/gemini-2.5-flash",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Проанализируй одежду на исходном фото. Верни только JSON: title (короткое название на русском), description (2 продающих предложения без выдуманных материалов), category, suggestedPrice (разумная цена BYN числом), colors (массив), sizes (массив стандартных размеров), imagePrompt (точное английское описание видимой одежды: тип, крой, цвет, длина, рукава, ворот, принты, швы, фурнитура и другие различимые детали; не описывай фон и модель).",
            },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  });

  if (!response.ok) throw new Error(`OpenRouter: ${response.status} ${(await response.text()).slice(0, 300)}`);
  const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenRouter не вернул описание товара");
  const cleaned = content.replace(/^```json\s*/i, "").replace(/```\s*$/, "");
  const draft = productDraftSchema.parse(JSON.parse(cleaned));

  let generatedImages: string[] = [];
  try {
    const results = await generateOpenRouterImages({
      model: process.env.OPENROUTER_IMAGE_MODEL || "google/gemini-3.1-flash-image",
      prompt: `Create a photorealistic premium fashion ecommerce photograph of an adult model wearing the exact garment from the reference image. Garment description: ${draft.imagePrompt}. Merchant creative direction: ${customPrompt || "Minimalist studio, neutral light-gray seamless background, soft diffused light, natural pose and commercial fashion catalogue styling."} The garment is the hero and must remain faithful to the reference: preserve its exact design, construction, cut, proportions, length, color, fabric appearance, seams, collar, sleeves, pockets, prints, logos and hardware. Do not redesign, simplify, add or remove garment details. Keep realistic skin, fabric texture and natural proportions. No text, no watermark, no extra garments covering the product.`,
      inputReferences: [dataUrl],
      count: Math.min(Math.max(requestedCount, 1), 4),
    });
    generatedImages = results.flatMap((result) => {
      const image = result.url || (result.base64 ? `data:image/png;base64,${result.base64}` : undefined);
      return image ? [image] : [];
    });
  } catch (error) {
    console.error("Image generation failed:", error);
    throw error;
  }

  if (!generatedImages.length) throw new Error("OpenRouter не вернул варианты изображений");
  return { ...draft, generatedImages };
}

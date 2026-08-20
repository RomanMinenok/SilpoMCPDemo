const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL = "deepseek/deepseek-v4-flash-0731";

export class CommentaryError extends Error {}

export function sanitizeTopProducts(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((product) => {
      const name = String(product?.name || "").replace(/\s+/g, " ").trim().slice(0, 120);
      const purchaseCount = Number(product?.purchaseCount);
      return {
        name,
        purchaseCount: Number.isFinite(purchaseCount) ? Math.max(0, Math.min(Math.round(purchaseCount), 1000000)) : 0
      };
    })
    .filter((product) => product.name)
    .slice(0, 10);
}

export async function createTopProductsCommentary(value, origin) {
  const apiKey = String(process.env.OPENROUTER_API_KEY || "").trim();
  if (!apiKey) throw new CommentaryError("AI-коментар ще не налаштований.");

  const products = sanitizeTopProducts(value);
  if (!products.length) throw new CommentaryError("Немає товарів для коментаря.");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": origin,
        "X-OpenRouter-Title": "Silpo Purchase Pulse"
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        temperature: 0.9,
        max_tokens: 120,
        reasoning: { effort: "none" },
        messages: [
          {
            role: "system",
            content: "Ти доброзичливий комікс-критик продуктових кошиків. Напиши українською одну коротку, теплу й гумористичну репліку про цей топ товарів: максимум 2 речення і 280 символів. Не вигадуй фактів, не згадуй ціни, здоров'я, особисті дані чи бренди поза списком. Відповідай лише готовою реплікою без лапок, заголовків і емодзі."
          },
          {
            role: "user",
            content: `Топ товарів за кількістю чеків:\n${products.map((product, index) => `${index + 1}. ${product.name} — ${product.purchaseCount}`).join("\n")}`
          }
        ]
      }),
      signal: controller.signal
    });

    if (!response.ok) throw new CommentaryError("Кишеньковий критик саме пішов по хліб. Спробуйте ще раз.");
    const payload = await response.json();
    const commentary = normalizeCommentary(payload?.choices?.[0]?.message?.content);
    if (!commentary) throw new CommentaryError("Кишеньковий критик не знайшов слів. Спробуйте ще раз.");
    return commentary;
  } catch (error) {
    if (error instanceof CommentaryError) throw error;
    throw new CommentaryError("Кишеньковий критик саме пішов по хліб. Спробуйте ще раз.");
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeCommentary(value) {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, 280)
    : "";
}

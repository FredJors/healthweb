import type { MealEstimate } from "./types";
import { blobToBase64 } from "./photo";
import { getApiKey, getModel } from "./settings";

/**
 * KI-Kalorienschätzung: schickt das (bereits verkleinerte) Foto direkt aus
 * dem Browser an die Anthropic-API — mit dem API-Key des Nutzers, der das
 * Gerät nie in Richtung unseres Hosts verlässt. Die Antwort ist per
 * JSON-Schema strukturiert, damit kein Parsen von Fließtext nötig ist.
 */

const ESTIMATE_SCHEMA = {
  type: "object",
  properties: {
    dish: {
      type: "string",
      description: "Kurzer deutscher Name des Gerichts, z. B. 'Spaghetti Bolognese'",
    },
    kcal: { type: "integer", description: "Beste Schätzung der Gesamtkalorien" },
    kcal_min: { type: "integer", description: "Untere plausible Grenze" },
    kcal_max: { type: "integer", description: "Obere plausible Grenze" },
    confidence: { type: "string", enum: ["niedrig", "mittel", "hoch"] },
    note: {
      type: "string",
      description:
        "Ein kurzer deutscher Satz zur Zusammensetzung/Portionsgröße",
    },
  },
  required: ["dish", "kcal", "kcal_min", "kcal_max", "confidence", "note"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT =
  "Du bist Ernährungsberater und schätzt Kalorien von Essensfotos. " +
  "Schätze die Portionsgröße anhand von Referenzobjekten im Bild (Teller, " +
  "Besteck, Glas) und berücksichtige versteckte Kalorien (Öl, Soßen, " +
  "Dressing). Antworte realistisch statt vorsichtig-niedrig. Wenn das Bild " +
  "kein Essen zeigt, setze kcal auf 0 und erkläre das in note.";

export async function estimateCaloriesFromPhoto(
  photo: Blob
): Promise<MealEstimate> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error(
      "Kein API-Key hinterlegt — bitte zuerst in den Einstellungen eintragen."
    );
  }

  // SDK erst bei Bedarf laden, damit es nicht im Haupt-Bundle landet
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({
    apiKey,
    // Bewusst: Der Nutzer verwendet seinen EIGENEN Key clientseitig —
    // es gibt kein Backend, das ihn verstecken könnte.
    dangerouslyAllowBrowser: true,
  });

  const data = await blobToBase64(photo);

  try {
    const response = await client.messages.create({
      model: getModel(),
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      output_config: {
        format: { type: "json_schema", schema: ESTIMATE_SCHEMA },
      },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: "image/jpeg", data },
            },
            {
              type: "text",
              text: "Schätze die Kalorien dieser Mahlzeit auf dem Foto.",
            },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      throw new Error("Die KI hat die Analyse dieses Bildes abgelehnt.");
    }

    const text = response.content.find((b) => b.type === "text")?.text;
    if (!text) throw new Error("Die KI hat keine verwertbare Antwort geliefert.");
    return JSON.parse(text) as MealEstimate;
  } catch (error) {
    throw toGermanError(error, Anthropic);
  }
}

/** Kleiner Verbindungstest für die Einstellungen-Seite. */
export async function testApiKey(key: string, model: string): Promise<void> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
  try {
    await client.messages.create({
      model,
      max_tokens: 1,
      messages: [{ role: "user", content: "Hi" }],
    });
  } catch (error) {
    throw toGermanError(error, Anthropic);
  }
}

function toGermanError(
  error: unknown,
  Anthropic: typeof import("@anthropic-ai/sdk").default
): Error {
  if (error instanceof Anthropic.AuthenticationError) {
    return new Error("API-Key ungültig oder widerrufen — bitte prüfen.");
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return new Error("Der API-Key hat keinen Zugriff auf dieses Modell.");
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new Error("Rate-Limit erreicht — bitte kurz warten und erneut versuchen.");
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new Error("Keine Verbindung zur Anthropic-API — Internetverbindung prüfen.");
  }
  if (error instanceof Anthropic.APIError) {
    return new Error(`API-Fehler (${error.status}): ${error.message}`);
  }
  return error instanceof Error ? error : new Error("Unbekannter Fehler.");
}


import { GoogleGenAI, Type } from "@google/genai";
import type { Handler } from "@netlify/functions";

// --- Gemini AI Setup ---
// Initialize the AI client with the API key from environment variables
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

// --- Schemas for Structured Output ---
const recipeSchema = {
  type: Type.OBJECT,
  properties: {
    recipeName: {
      type: Type.STRING,
      description: "Der Name des Rezepts."
    },
    description: {
        type: Type.STRING,
        description: "Eine kurze, ansprechende Beschreibung des Gerichts."
    },
    ingredients: {
      type: Type.ARRAY,
      description: "Eine Liste der Zutaten, die für das Rezept benötigt werden. Starte jede Zeile mit der Menge und Einheit (z.B. '500g Nudeln').",
      items: { type: Type.STRING }
    },
    instructions: {
      type: Type.ARRAY,
      description: "Eine schrittweise Anleitung zur Zubereitung des Gerichts.",
      items: { type: Type.STRING }
    },
  },
  required: ["recipeName", "description", "ingredients", "instructions"],
};

const ocrSchema = {
    type: Type.OBJECT,
    properties: {
        isReadable: {
            type: Type.BOOLEAN,
            description: "Gibt an, ob der Text auf dem Bild insgesamt lesbar war."
        },
        unreadableReason: {
            type: Type.STRING,
            description: "Optionaler Grund, warum das Bild nicht lesbar war (z.B. 'verschwommen', 'handschriftlich')."
        },
        recipeName: {
            type: Type.STRING,
            description: "Der Name des Gerichts, wenn auf dem Bild erkennbar."
        },
        ingredients: {
            type: Type.ARRAY,
            description: "Eine Liste der auf dem Bild erkannten Zutaten.",
            items: { type: Type.STRING }
        },
        instructions: {
            type: Type.ARRAY,
            description: "Eine Liste der auf dem Bild erkannten Zubereitungsschritte.",
            items: { type: Type.STRING }
        }
    },
    required: ["isReadable"]
};


// --- Netlify Function Handler ---
export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST' || !event.body) {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const body = JSON.parse(event.body);
    const { type } = body;

    let result;
    
    // Handle recipe generation requests
    if (type === 'generate') {
      const { prompt: dishPrompt, difficulty, wishes, servings } = body;
      const prompt = `
        Erstelle ein einfaches und günstiges Rezept für Lehrlinge basierend auf den folgenden Angaben.
        Gib die Antwort als einzelnes JSON-Objekt zurück, das dem bereitgestellten Schema entspricht. Gib keinen Markdown oder zusätzlichen Text aus.

        Gericht: "${dishPrompt}"
        Schwierigkeitsgrad: "${difficulty}"
        Anzahl Portionen: ${servings || 2}
        Zusätzliche Wünsche: "${wishes || 'Keine'}"
      `;
      result = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: recipeSchema,
        },
      });

    // Handle OCR (image-to-text) requests
    } else if (type === 'ocr') {
      const { image, mimeType } = body;
      const imagePart = {
        inlineData: { mimeType, data: image },
      };
      const prompt = `
            Analysiere das folgende Bild eines Rezepts. Das Bild enthält wahrscheinlich **handschriftlichen Text**, der in Schreibschrift oder Druckbuchstaben verfasst sein kann. Das Bild könnte auch schlecht beleuchtet oder verschwommen sein.

            **Spezialanweisungen für Handschrift:**
            - Gib dein Bestes, um auch unklare Handschriften zu entziffern.
            - Konzentriere dich darauf, den Sinn und die wesentlichen Informationen (Zutaten, Schritte) zu erfassen, auch wenn einzelne Buchstaben schwer zu lesen sind.
            - Wenn ein Wort mehrdeutig ist, versuche, es aus dem Kontext des Rezepts zu erschließen. Priorisiere eine lesbare und plausible Interpretation gegenüber einer buchstabengetreuen, aber unsinnigen Transkription.

            **Allgemeine Anweisungen:**
            1. Wenn der Text trotz aller Bemühungen **völlig unleserlich** ist (z.B. durch extreme Unschärfe oder sehr unordentliche Schrift), setze 'isReadable' auf 'false' und gib im Feld 'unreadableReason' eine kurze Begründung an (z.B. 'handschriftlich unleserlich', 'stark verschwommen').
            2. Wenn das Rezept zumindest teilweise entziffert werden kann, setze 'isReadable' auf 'true' und extrahiere den Rezeptnamen, die Zutaten und die Anleitung so gut wie möglich.
            3. Lasse Felder leer, wenn die entsprechenden Informationen nicht auf dem Bild vorhanden sind oder nicht entziffert werden können.

            Gib die Antwort als einzelnes JSON-Objekt zurück, das dem bereitgestellten Schema entspricht. Gib keinen Markdown oder zusätzlichen Text aus.
        `;

      result = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [imagePart, { text: prompt }] },
        config: {
          responseMimeType: "application/json",
          responseSchema: ocrSchema,
        },
      });

    } else {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request type specified.' }) };
    }
    
    const responseText = result.text.trim();

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: responseText,
    };

  } catch (error) {
    console.error("Error in Netlify function:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "An internal server error occurred while processing the request." }),
    };
  }
};

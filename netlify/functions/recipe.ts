
import { GoogleGenAI, Type } from "@google/genai";
import type { Handler } from "@netlify/functions";

// Always initialize with named parameters and use process.env.API_KEY
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const recipeSchema = {
  type: Type.OBJECT,
  properties: {
    recipeName: { type: Type.STRING },
    description: { type: Type.STRING },
    ingredients: { type: Type.ARRAY, items: { type: Type.STRING } },
    instructions: { type: Type.ARRAY, items: { type: Type.STRING } },
    nutrition: {
        type: Type.OBJECT,
        properties: {
            calories: { type: Type.STRING },
            protein: { type: Type.STRING },
            carbs: { type: Type.STRING },
            fat: { type: Type.STRING }
        },
        required: ["calories", "protein", "carbs", "fat"]
    }
  },
  required: ["recipeName", "description", "ingredients", "instructions", "nutrition"],
};

const combinedScanSchema = {
    type: Type.OBJECT,
    properties: {
        isReadable: { 
            type: Type.BOOLEAN, 
            description: "True, wenn Lebensmittel oder ein Kühlschrankinhalt eindeutig erkannt wurden." 
        },
        unreadableReason: { 
            type: Type.STRING, 
            description: "Falls isReadable false ist, nenne den Grund: 'Bild nicht lesbar', 'Lichtverhältnisse schlecht' oder 'Zutaten nicht erkannt'." 
        },
        recipe: {
            type: Type.OBJECT,
            properties: { 
              ingredients: { type: Type.ARRAY, items: { type: Type.STRING } } 
            },
            required: ["ingredients"]
        }
    },
    required: ["isReadable"]
};

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST' || !event.body) return { statusCode: 405, body: 'Not Allowed' };
  if (!process.env.API_KEY) return { statusCode: 500, body: JSON.stringify({ error: "API Key fehlt in der Umgebung" }) };

  try {
    const body = JSON.parse(event.body);
    // Use gemini-3-pro-preview for complex reasoning and high-quality recipe generation
    const modelName = 'gemini-3-pro-preview'; 

    if (body.type === 'generate') {
      const result = await ai.models.generateContent({
        model: modelName,
        contents: { parts: [{ text: `Handele als Profi-Koch. Erstelle ein Rezept für: ${body.prompt}. Schwierigkeit: ${body.difficulty || 'leicht'}. Personen: ${body.servings || 2}. Wünsche: ${body.wishes || 'keine'}.` }] },
        config: { 
            responseMimeType: "application/json", 
            responseSchema: recipeSchema,
            systemInstruction: "Erstelle ein hochqualitatives, deutsches Gourmet-Rezept mit präzisen Mengenangaben und Nährwertschätzung."
        },
      });
      // Correctly access the .text property from the response
      return { 
          statusCode: 200, 
          headers: { "Content-Type": "application/json" },
          body: result.text 
      };

    } else if (body.type === 'scan-to-recipe') {
      const result = await ai.models.generateContent({
        model: modelName,
        contents: { 
            parts: [
                { inlineData: { mimeType: body.mimeType, data: body.image } }, 
                { text: "Welche Lebensmittel sind auf diesem Bild zu sehen? Liste sie auf." }
            ] 
        },
        config: { 
            responseMimeType: "application/json", 
            responseSchema: combinedScanSchema,
            systemInstruction: `Du bist ein Vision-Experte für Lebensmittel. 
            Prüfe das Bild zuerst auf Qualität.
            
            FEHLER-KATEGORIEN:
            - Wenn das Bild extrem unscharf ist oder keine Lebensmittel zeigt: setze isReadable=false und unreadableReason='Bild nicht lesbar'.
            - Wenn es zu dunkel oder überbelichtet ist: setze isReadable=false und unreadableReason='Lichtverhältnisse schlecht'.
            - Wenn alles ok ist, aber absolut keine Lebensmittel/Zutaten zu finden sind: setze isReadable=false und unreadableReason='Zutaten nicht erkannt'.
            
            ERFOLG:
            - Wenn Lebensmittel gefunden werden: setze isReadable=true und liste ALLE gefundenen Zutaten in 'recipe.ingredients' auf.`
        },
      });
      // Correctly access the .text property from the response
      return { 
          statusCode: 200, 
          headers: { "Content-Type": "application/json" },
          body: result.text 
      };
    }
    return { statusCode: 400, body: 'Ungültiger Request-Typ' };
  } catch (error: any) {
    console.error("Netlify Function Error:", error);
    return { 
        statusCode: 500, 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: error.message || "Interner Serverfehler" }) 
    };
  }
};

import { GoogleGenAI } from "@google/genai";

/**
 * Edits an image based on a text prompt using Gemini.
 * @param apiKey The user's Gemini API Key.
 * @param base64Image The image data in base64 format (without the data:image/png;base64, prefix).
 * @param mimeType The mime type of the image (e.g., 'image/png').
 * @param prompt The user instruction for editing.
 * @returns The edited image as a base64 data URL.
 */
export const editImageWithGemini = async (
  apiKey: string,
  base64Image: string,
  mimeType: string,
  prompt: string
): Promise<string> => {
  if (!apiKey) {
    throw new Error("ACCESS DENIED: MISSING API KEY");
  }

  try {
    // Initialize client with user provided key
    const ai = new GoogleGenAI({ apiKey });
    const model = 'gemini-2.5-flash-image';
    
    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Image,
              mimeType: mimeType,
            },
          },
          {
            text: prompt,
          },
        ],
      },
    });

    // Parse response for image data
    const parts = response.candidates?.[0]?.content?.parts;
    
    if (parts) {
      for (const part of parts) {
        if (part.inlineData && part.inlineData.data) {
          const newMime = part.inlineData.mimeType || 'image/png';
          return `data:${newMime};base64,${part.inlineData.data}`;
        }
      }
    }

    throw new Error("GENERATION FAILED: NO IMAGE DATA RETURNED");

  } catch (error: any) {
    console.error("Gemini API Error:", error);
    throw new Error(error.message || "AI PROTOCOL FAILURE");
  }
};
import { GoogleGenAI, Type } from "@google/genai";
import { Signal, SignalType } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function analyzeChartFrame(base64Image: string): Promise<Signal | null> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          parts: [
            {
              text: `Analyze this live Gold chart. Look for trading signals (Buy/Sell/Close). 
              Identify the current price and the signal type if any. 
              Output the result in JSON format.`,
            },
            {
              inlineData: {
                mimeType: "image/png",
                data: base64Image.split(",")[1] || base64Image,
              },
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            signal: {
              type: Type.STRING,
              enum: ["BUY", "SELL", "CLOSE", "NONE"],
              description: "The detected trading signal.",
            },
            price: {
              type: Type.NUMBER,
              description: "The current price of Gold shown on the chart.",
            },
            confidence: {
              type: Type.NUMBER,
              description: "Confidence level of the detection (0-1).",
            },
          },
          required: ["signal", "price", "confidence"],
        },
      },
    });

    const result = JSON.parse(response.text || "{}");
    
    if (result.signal === "NONE") return null;

    return {
      type: result.signal as SignalType,
      price: result.price,
      confidence: result.confidence,
      timestamp: new Date(),
    };
  } catch (error) {
    console.error("Error analyzing chart frame:", error);
    return null;
  }
}

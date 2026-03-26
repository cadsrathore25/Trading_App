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
              text: `Analyze this live trading chart. Look for the most recent signal marker. 
              To find the most recent signal, scan the chart from RIGHT to LEFT. The very first signal you encounter when moving from the right edge of the chart towards the left is the current active signal.
              The signals are typically labeled '+Smart Buy' (green) or '+Smart Sell' (red/pink). 
              What is the most recent signal? Respond with ONLY 'BUY', 'SELL', or 'NONE' if no clear signal is found.
              Also identify the current price if visible.`,
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
              description: "The detected trading signal (+Smart Buy -> BUY, +Smart Sell -> SELL).",
            },
            price: {
              type: Type.NUMBER,
              description: "The current price of the asset shown on the chart.",
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

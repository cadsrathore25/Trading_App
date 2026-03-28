import { GoogleGenAI, Type } from "@google/genai";
import { Signal, SignalType } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function analyzeChartFrame(base64Image: string, retries = 2): Promise<Signal | null> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          parts: [
            {
              text: `Analyze this live trading chart. 
              
              CRITICAL: You must first scan the chart for the presence of a 'Buy', 'Sell', '+Smart Buy', or '+Smart Sell' icon. 
              If NO such signal icon is clearly visible in the chart, you MUST return 'NONE' for the signal.
              
              Do NOT infer signals based on chart trends, candle colors, or indicator lines. Only report a signal if an explicit text-based icon is present.
              
              If an icon is present, identify the signal type based on the text on the icon.
              Respond with ONLY 'BUY', 'SELL', or 'NONE' if no clear signal icon is found.
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

    let type: SignalType = 'LONG';
    if (result.signal === 'BUY') type = 'LONG';
    else if (result.signal === 'SELL') type = 'SHORT';
    else return null;

    return {
      type,
      price: result.price,
      confidence: result.confidence,
      timestamp: new Date(),
    };
  } catch (error) {
    console.error("Error analyzing chart frame:", error);
    if (retries > 0) {
      console.log(`Retrying analysis... (${retries} retries left)`);
      return analyzeChartFrame(base64Image, retries - 1);
    }
    return null;
  }
}

import { GoogleGenerativeAI } from '@google/generative-ai';
import { IAIService } from './ai-service-base';

export class GeminiAIService implements IAIService {
  private genAI: GoogleGenerativeAI;
  private model: any;
  private modelName: string;
  private apiKey: string;

  constructor(apiKey: string, modelName: string = 'gemini-2.5-flash') {
    this.apiKey = apiKey;
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.modelName = modelName;
    this.model = this.genAI.getGenerativeModel({ model: modelName });
  }

  async chat(message: string, context: any) {
    const prompt = `
      You are a Pokemon game developer expert for RPG Maker XP and Pokemon Essentials.
      You follow best practices from:
      - Thundaga (Essentials fundamentals, map basics, and getting started)
      - ShepskyDad (Game design, type triangles, and character/gym leader development)
      - Relic Castle and PokeCommunity (Advanced scripting and community resources)
      
      User message: "${message}"
      
      Current project context: ${JSON.stringify(context)}
      
      If the user wants to create a map, respond with a JSON object that includes:
      1. "text": A friendly message to the user.
      2. "mapData": An object describing the map with:
         - "name": string
         - "width": number (min 20)
         - "height": number (min 15)
         - "tilesetId": number (default 1)
         - "layers": number[][][] (3 layers of tile IDs)
         - "events": array of event objects
      
      Otherwise, respond with a helpful text message.
      
      IMPORTANT: Only return JSON if you are generating a map or performing an action.
    `;

    try {
      console.log(`Attempting Gemini request via ${this.modelName}...`);
      const modelInstance = this.genAI.getGenerativeModel(
        { model: this.modelName }, 
        { apiVersion: 'v1beta' }
      );
      const result = await modelInstance.generateContent(prompt);
      const response = await result.response;
      return this.parseResponse(response.text());
    } catch (err: any) {
      const errMsg = err.message || String(err);
      console.error(`Gemini Error (${this.modelName}):`, errMsg);
      
      if (errMsg.includes('503') || errMsg.includes('overloaded')) {
        throw new Error(`The model "${this.modelName}" is temporarily overloaded. Please wait a moment and try again.`);
      } else if (errMsg.includes('429') || errMsg.includes('quota')) {
        throw new Error(`Rate limit reached for "${this.modelName}". Please wait a minute before trying again.`);
      } else if (errMsg.includes('400')) {
        throw new Error(`The model "${this.modelName}" cannot process this request. Try selecting a different model.`);
      }
      throw new Error(`AI request failed: ${errMsg}`);
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
        headers: { 'x-goog-api-key': this.apiKey }
      });
      const data = await response.json();
      
      if (data.models && Array.isArray(data.models)) {
        return data.models
          .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
          .map((m: any) => m.name.replace('models/', ''))
          .filter((name: string) => !name.includes('-tts') && !name.includes('-image') && !name.includes('embedding'))
          .sort((a: string, b: string) => {
            const getVersion = (name: string) => {
              const match = name.match(/(\d+\.\d+)/);
              return match ? parseFloat(match[1]) : 0;
            };
            return getVersion(b) - getVersion(a);
          });
      }
    } catch (err) {
      console.error('Failed to fetch available models:', err);
    }
    return ['gemini-2.5-flash', 'gemini-2.0-flash-exp', 'gemini-1.5-flash'];
  }

  async ping(): Promise<{ success: boolean; model: string; error?: string }> {
    console.log('Fetching available models from Gemini API...');
    const availableModels = await this.listModels();
    console.log('Available Gemini models:', availableModels.slice(0, 10));

    const errors: string[] = [];

    for (const modelName of availableModels.slice(0, 5)) {
      try {
        console.log(`Ping test: trying ${modelName}...`);
        const model = this.genAI.getGenerativeModel(
          { model: modelName }, 
          { apiVersion: 'v1beta' }
        );
        const result = await model.generateContent('Say OK');
        const text = result.response.text();
        if (text) {
          console.log(`SUCCESS: ${modelName} responded: ${text.substring(0, 50)}`);
          return { success: true, model: modelName };
        }
      } catch (err: any) {
        const errMsg = err.message || String(err);
        console.error(`Ping failed for ${modelName}:`, errMsg.substring(0, 100));
        errors.push(`${modelName}: ${errMsg.substring(0, 60)}`);
      }
    }
    return { 
      success: false, 
      model: 'none', 
      error: `All models failed:\n${errors.join('\n')}` 
    };
  }

  private parseResponse(text: string) {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      // Not JSON
    }
    return { text };
  }

  setModel(modelName: string) {
    this.modelName = modelName;
    this.model = this.genAI.getGenerativeModel({ model: modelName });
  }

  // Gemini doesn't provide detailed quota info, return empty
  getCachedQuota(): { hasData: boolean; info: any; lastUpdate: Date | null } {
    return {
      hasData: false,
      info: null,
      lastUpdate: null
    };
  }
}

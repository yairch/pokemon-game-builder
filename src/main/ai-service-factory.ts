import { IAIService, AIProvider } from './ai-service-base';
import { GeminiAIService } from './ai-service-gemini';
import { ClaudeAIService } from './ai-service-claude';
import { API_KEYS } from './constants';

/**
 * Factory to create AI service instances based on provider type
 */
export class AIServiceFactory {
  /**
   * Create an AI service instance based on provider type
   * @param provider 'claude' or 'gemini'
   * @param apiKey API key for the provider
   * @param modelName Optional model name (uses default if not provided)
   * @returns IAIService instance
   */
  static create(
    provider: AIProvider,
    apiKey: string,
    modelName?: string
  ): IAIService {
    if (!apiKey) {
      throw new Error(`API key is required for ${provider}`);
    }

    switch (provider) {
      case 'claude':
        return new ClaudeAIService(apiKey, modelName);
      case 'gemini':
        return new GeminiAIService(apiKey, modelName);
      default:
        throw new Error(`Unknown AI provider: ${provider}`);
    }
  }

  /**
   * Get API key from config or constants
   * @param provider Provider type
   * @param config Config object with API keys
   * @returns API key string
   */
  static getApiKey(provider: AIProvider, config: any): string {
    if (provider === 'claude') {
      return config.claudeApiKey || API_KEYS.CLAUDE_API_KEY || process.env.CLAUDE_API_KEY || '';
    } else {
      return config.geminiApiKey || process.env.GEMINI_API_KEY || '';
    }
  }
}

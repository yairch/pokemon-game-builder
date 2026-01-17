/**
 * Base interface for AI service providers
 * All AI providers must implement this interface
 */
export interface IAIService {
  /**
   * Send a chat message to the AI service
   * @param message User message
   * @param context Project context
   * @returns Response object (may include text, mapData, etc.)
   */
  chat(message: string, context: any): Promise<any>;

  /**
   * Test connectivity and get available models
   * @returns Ping result with success status and model info
   */
  ping(): Promise<{ success: boolean; model: string; error?: string; rateLimitInfo?: any }>;

  /**
   * List all available models for this provider
   * @returns Array of model names
   */
  listModels(): Promise<string[]>;

  /**
   * Get cached quota information (if available)
   * @returns Object with quota data and cache status
   */
  getCachedQuota?(): { hasData: boolean; info: any; lastUpdate: Date | null };
}

/**
 * AI Provider types
 */
export type AIProvider = 'claude' | 'gemini';

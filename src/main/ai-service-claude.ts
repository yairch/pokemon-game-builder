import Anthropic from '@anthropic-ai/sdk';
import { IAIService } from './ai-service-base';

export class ClaudeAIService implements IAIService {
  private client: Anthropic;
  private modelName: string;
  private lastRateLimitInfo: any = null; // Cache last known rate limit info
  private lastRateLimitUpdate: Date | null = null;

  constructor(apiKey: string, modelName: string = 'claude-3-5-sonnet-20241022') {
    if (!apiKey || !apiKey.trim()) {
      throw new Error('Claude API key is required');
    }
    // Validate API key format (should start with sk-ant-)
    if (!apiKey.startsWith('sk-ant-')) {
      console.warn('Claude API key format may be invalid. Expected format: sk-ant-...');
    }
    this.client = new Anthropic({ apiKey: apiKey.trim() });
    this.modelName = modelName;
    console.log(`ClaudeAIService initialized with model: ${modelName}`);
  }

  private getMaxTokens(): number {
    // Model-specific max token limits
    if (this.modelName.includes('haiku')) {
      return 4096; // Haiku models have 4096 max
    }
    if (this.modelName.includes('sonnet') || this.modelName.includes('opus')) {
      return 8192; // Sonnet and Opus can handle more
    }
    return 4096; // Default to safe limit
  }

  async chat(message: string, context: any) {
    const systemPrompt = `You are a Pokemon game developer expert for RPG Maker XP and Pokemon Essentials.
You follow best practices from:
- Thundaga (Essentials fundamentals, map basics, and getting started)
- ShepskyDad (Game design, type triangles, and character/gym leader development)
- Relic Castle and PokeCommunity (Advanced scripting and community resources)

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

IMPORTANT: Only return JSON if you are generating a map or performing an action.`;

    try {
      const maxTokens = this.getMaxTokens();
      console.log(`Attempting Claude request via ${this.modelName} (max_tokens: ${maxTokens})...`);
      const response = await this.client.messages.create({
        model: this.modelName,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: message
          }
        ]
      });

      // Log and cache rate limit info from successful response
      const headers = (response as any).headers || (response as any).response?.headers;
      if (headers) {
        const rateLimitInfo = this.extractRateLimitHeaders(headers);
        if (Object.keys(rateLimitInfo).length > 0) {
          this.lastRateLimitInfo = rateLimitInfo;
          this.lastRateLimitUpdate = new Date();
        }
        this.logRateLimitInfo(headers);
      }

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      return this.parseResponse(text);
    } catch (err: any) {
      const errMsg = err.message || String(err);
      const errStatus = err.status || err.statusCode || 'unknown';
      const errType = err.type || err.name || 'Error';
      const headers = err.headers || {};
      
      const currentRateLimitInfo = this.extractRateLimitHeaders(headers);
      
      console.error(`Claude Error (${this.modelName}):`, {
        message: errMsg,
        status: errStatus,
        type: errType,
        headers: currentRateLimitInfo,
        fullError: err
      });

      // If headers are empty/null and we have cached info, log it
      const hasValidHeaders = Object.values(currentRateLimitInfo).some(v => v !== null && v !== undefined);
      if (!hasValidHeaders && this.lastRateLimitInfo) {
        const cacheAge = this.lastRateLimitUpdate 
          ? Math.floor((Date.now() - this.lastRateLimitUpdate.getTime()) / 1000)
          : 'unknown';
        console.log(`ℹ️  Using cached rate limit info (${cacheAge}s old):`, this.lastRateLimitInfo);
      }
      
      // Handle rate limit (429) with detailed retry info
      if (errStatus === 429 || errMsg.includes('429') || errMsg.includes('rate limit')) {
        const retryAfter = this.getHeaderValue(headers, 'retry-after') || '60';
        const retrySeconds = parseInt(retryAfter);
        const requestsRemaining = this.getHeaderValue(headers, 'anthropic-ratelimit-requests-remaining') || 'unknown';
        const resetTime = this.getHeaderValue(headers, 'anthropic-ratelimit-requests-reset');
        
        let retryMessage = `Rate limit exceeded. Please wait ${retrySeconds} seconds before retrying.`;
        
        if (resetTime) {
          const resetDate = new Date(resetTime);
          const timeUntilReset = Math.ceil((resetDate.getTime() - Date.now()) / 1000);
          if (timeUntilReset > 0) {
            retryMessage += `\n\nQuota resets in ${timeUntilReset} seconds (at ${resetDate.toLocaleTimeString()})`;
          }
        }
        
        if (requestsRemaining !== 'unknown') {
          retryMessage += `\nRequests remaining: ${requestsRemaining}`;
        }
        
        throw new Error(retryMessage);
      }
      
      // Handle insufficient credits (400 with specific message)
      if (errStatus === 400 && (errMsg.includes('credit balance') || errMsg.includes('billing'))) {
        let errorMessage = `❌ Insufficient credits in your Anthropic account.\n\nPlease add credits at: https://console.anthropic.com/settings/billing`;
        
        // Include last known rate limit info if available
        if (this.lastRateLimitInfo && this.lastRateLimitUpdate) {
          const cacheAge = Math.floor((Date.now() - this.lastRateLimitUpdate.getTime()) / 1000);
          errorMessage += `\n\n📊 Last known quota (${cacheAge}s ago):`;
          
          const requestsRemaining = this.lastRateLimitInfo['anthropic-ratelimit-requests-remaining'];
          const requestsLimit = this.lastRateLimitInfo['anthropic-ratelimit-requests-limit'];
          const tokensRemaining = this.lastRateLimitInfo['anthropic-ratelimit-tokens-remaining'];
          const tokensLimit = this.lastRateLimitInfo['anthropic-ratelimit-tokens-limit'];
          
          if (requestsRemaining && requestsLimit) {
            errorMessage += `\n  • Requests: ${requestsRemaining}/${requestsLimit}`;
          }
          if (tokensRemaining && tokensLimit) {
            errorMessage += `\n  • Tokens: ${tokensRemaining}/${tokensLimit}`;
          }
          
          const resetTime = this.lastRateLimitInfo['anthropic-ratelimit-requests-reset'];
          if (resetTime) {
            const resetDate = new Date(resetTime);
            const now = new Date();
            if (resetDate > now) {
              const timeUntilReset = Math.ceil((resetDate.getTime() - now.getTime()) / 1000);
              errorMessage += `\n  • Quota resets in: ${timeUntilReset}s`;
            }
          }
          
          errorMessage += `\n\n⚠️  Note: Billing errors don't include current quota info.`;
        } else {
          // No cached data available - explain why
          errorMessage += `\n\n📊 Quota Information: Not available`;
          errorMessage += `\n  ℹ️  Quota data requires at least one successful API request.`;
          errorMessage += `\n  ℹ️  After adding credits, quota info will be displayed here.`;
        }
        
        throw new Error(errorMessage);
      }
      
      // Handle authentication errors
      if (errStatus === 401 || errMsg.includes('401') || errMsg.includes('authentication') || errMsg.includes('Invalid API key')) {
        throw new Error(`Invalid API key. Please check your Claude API key. Error: ${errMsg}`);
      }
      
      // Handle permission errors
      if (errStatus === 403 || errMsg.includes('403') || errMsg.includes('Forbidden')) {
        throw new Error(`API key does not have access. Please check your Claude API key permissions. Error: ${errMsg}`);
      }
      
      // Handle service overload
      if (errStatus === 503 || errMsg.includes('503') || errMsg.includes('overloaded') || errMsg.includes('service unavailable')) {
        throw new Error(`The model "${this.modelName}" is temporarily overloaded. Please wait a moment and try again.`);
      }
      
      // Handle other 400 errors
      if (errStatus === 400 || errMsg.includes('400') || errMsg.includes('invalid') || errMsg.includes('bad request')) {
        throw new Error(`The model "${this.modelName}" cannot process this request. Error: ${errMsg}`);
      }
      
      // Handle model not found
      if (errMsg.includes('model') && errMsg.includes('not found')) {
        throw new Error(`Model "${this.modelName}" not found. Please select a different model.`);
      }
      
      throw new Error(`AI request failed (${errType}, status ${errStatus}): ${errMsg}`);
    }
  }

  async listModels(): Promise<string[]> {
    // Claude models are fixed - we can return the known available models
    // Note: Anthropic doesn't have a public API to list models, so we return the known models
    // Updated with latest active models as of 2024
    return [
      'claude-3-5-sonnet-20241022',  // Latest Sonnet
      'claude-3-5-sonnet-20240620',  // Previous Sonnet
      'claude-3-opus-20240229',      // Opus
      'claude-3-sonnet-20240229',   // Sonnet 3
      'claude-3-haiku-20240307',     // Haiku (fastest)
      'claude-3-5-haiku-20241022'   // Latest Haiku
    ];
  }

  async ping(): Promise<{ success: boolean; model: string; error?: string; rateLimitInfo?: any }> {
    console.log('Testing Claude API connectivity...');
    const availableModels = await this.listModels();
    console.log('Available Claude models:', availableModels);

    // Check if API key is set
    const apiKey = (this.client as any).apiKey;
    if (!apiKey) {
      return {
        success: false,
        model: 'none',
        error: 'No API key configured. Please set your Claude API key.'
      };
    }
    console.log(`API key present: ${apiKey.substring(0, 10)}...`);

    const errors: string[] = [];

    // Try all models
    for (const modelName of availableModels) {
      try {
        console.log(`Ping test: trying ${modelName}...`);
        const response = await this.client.messages.create({
          model: modelName,
          max_tokens: 10,
          messages: [
            {
              role: 'user',
              content: 'Say OK'
            }
          ]
        });

        const text = response.content[0].type === 'text' ? response.content[0].text : '';
        const headers = (response as any).headers || (response as any).response?.headers;
        const rateLimitInfo = headers ? this.extractRateLimitHeaders(headers) : {};
        
        if (text) {
          console.log(`SUCCESS: ${modelName} responded: ${text.substring(0, 50)}`);
          
          if (Object.keys(rateLimitInfo).length > 0) {
            console.log('📊 Rate Limit Status:', rateLimitInfo);
          }
          
          return { 
            success: true, 
            model: modelName,
            rateLimitInfo 
          };
        }
      } catch (err: any) {
        // Get more detailed error information
        const errMsg = err.message || String(err);
        const errStatus = err.status || err.statusCode || 'unknown';
        const errType = err.type || err.name || 'Error';
        const headers = err.headers || {};
        const rateLimitInfo = this.extractRateLimitHeaders(headers);
        
        console.error(`Ping failed for ${modelName}:`, {
          message: errMsg,
          status: errStatus,
          type: errType,
          rateLimitInfo,
          fullError: err
        });
        
        // For insufficient credits, provide clear message
        if (errStatus === 400 && errMsg.includes('credit balance')) {
          return {
            success: false,
            model: modelName,
            error: `❌ Insufficient credits in your Anthropic account.\n\nPlease add credits at: https://console.anthropic.com/settings/billing`
          };
        }
        
        // For rate limits, include retry info
        if (errStatus === 429) {
          const retryAfter = this.getHeaderValue(headers, 'retry-after') || '60';
          const resetTime = this.getHeaderValue(headers, 'anthropic-ratelimit-requests-reset');
          let errorMsg = `Rate limit exceeded. Wait ${retryAfter}s`;
          if (resetTime) {
            const resetDate = new Date(resetTime);
            errorMsg += ` (resets at ${resetDate.toLocaleTimeString()})`;
          }
          errors.push(`${modelName}: ${errorMsg}`);
          continue;
        }
        
        const fullError = `${errType} (${errStatus}): ${errMsg}`;
        errors.push(`${modelName}: ${fullError.substring(0, 100)}`);
      }
    }
    return { 
      success: false, 
      model: 'none', 
      error: `All ${availableModels.length} models failed:\n${errors.join('\n')}` 
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

  // Helper method to get header value (handles different header object types)
  private getHeaderValue(headers: any, key: string): string | undefined {
    if (!headers) return undefined;
    
    // Try Map-like get method
    if (typeof headers.get === 'function') {
      return headers.get(key);
    }
    
    // Try direct property access
    if (headers[key]) {
      return headers[key];
    }
    
    // Try case-insensitive search
    const lowerKey = key.toLowerCase();
    for (const headerKey in headers) {
      if (headerKey.toLowerCase() === lowerKey) {
        return headers[headerKey];
      }
    }
    
    return undefined;
  }

  // Extract rate limit headers from response
  private extractRateLimitHeaders(headers: any): any {
    const headerKeys = [
      'anthropic-ratelimit-requests-limit',
      'anthropic-ratelimit-requests-remaining',
      'anthropic-ratelimit-requests-reset',
      'anthropic-ratelimit-tokens-limit',
      'anthropic-ratelimit-tokens-remaining',
      'anthropic-ratelimit-tokens-reset',
      'retry-after'
    ];
    
    const result: any = {};
    for (const key of headerKeys) {
      const value = this.getHeaderValue(headers, key);
      if (value !== undefined) {
        result[key] = value;
      }
    }
    return result;
  }

  // Log rate limit info for monitoring
  private logRateLimitInfo(headers: any) {
    const rateLimitInfo = this.extractRateLimitHeaders(headers);
    if (Object.keys(rateLimitInfo).length > 0) {
      console.log('📊 Rate Limit Status:', rateLimitInfo);
      
      // Parse reset times for user-friendly display
      const requestsRemaining = rateLimitInfo['anthropic-ratelimit-requests-remaining'];
      const requestsLimit = rateLimitInfo['anthropic-ratelimit-requests-limit'];
      const tokensRemaining = rateLimitInfo['anthropic-ratelimit-tokens-remaining'];
      const tokensLimit = rateLimitInfo['anthropic-ratelimit-tokens-limit'];
      
      if (requestsRemaining && requestsLimit) {
        console.log(`  ⚡ Requests: ${requestsRemaining}/${requestsLimit} remaining`);
      }
      
      if (tokensRemaining && tokensLimit) {
        console.log(`  🎫 Tokens: ${tokensRemaining}/${tokensLimit} remaining`);
      }
      
      if (rateLimitInfo['anthropic-ratelimit-requests-reset']) {
        const resetDate = new Date(rateLimitInfo['anthropic-ratelimit-requests-reset']);
        const timeUntilReset = Math.ceil((resetDate.getTime() - Date.now()) / 1000);
        console.log(`  🔄 Requests reset in: ${timeUntilReset}s (${resetDate.toLocaleTimeString()})`);
      }
      
      if (rateLimitInfo['anthropic-ratelimit-tokens-reset']) {
        const resetDate = new Date(rateLimitInfo['anthropic-ratelimit-tokens-reset']);
        const timeUntilReset = Math.ceil((resetDate.getTime() - Date.now()) / 1000);
        console.log(`  🔄 Tokens reset in: ${timeUntilReset}s (${resetDate.toLocaleTimeString()})`);
      }
    }
  }

  setModel(modelName: string) {
    this.modelName = modelName;
  }

  // Get current cached quota info
  getCachedQuota(): { hasData: boolean; info: any; lastUpdate: Date | null } {
    return {
      hasData: this.lastRateLimitInfo !== null,
      info: this.lastRateLimitInfo,
      lastUpdate: this.lastRateLimitUpdate
    };
  }
}

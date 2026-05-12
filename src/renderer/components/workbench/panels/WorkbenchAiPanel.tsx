import React from 'react';
import { Key } from 'lucide-react';

export type WorkbenchAIProvider = 'claude' | 'gemini';

export interface ProviderVisualStyle {
  name: string;
  color: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
  inputBorder: string;
  buttonBg: string;
  buttonHover: string;
  linkUrl: string;
  linkText: string;
}

export interface WorkbenchAiPanelProps {
  currentProvider: WorkbenchAIProvider;
  onSelectProvider: (provider: WorkbenchAIProvider) => void;
  info: ProviderVisualStyle;
  localApiKey: string;
  onLocalApiKeyChange: (value: string) => void;
  onSaveApiKeyClick: () => void;
  saveDisabled: boolean;
  hasApiKey: boolean | null;
  openVendorLink: () => void;
  modelStatus: 'idle' | 'loading' | 'success' | 'error';
  errorMessage: string;
  availableModels: string[];
  selectedModel: string;
  onModelChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  onPingModel: () => void;
  isTestingModel: boolean;
  openQuotaLink: () => void;
}

export const WorkbenchAiPanel: React.FC<WorkbenchAiPanelProps> = ({
  currentProvider,
  onSelectProvider,
  info,
  localApiKey,
  onLocalApiKeyChange,
  onSaveApiKeyClick,
  saveDisabled,
  hasApiKey,
  openVendorLink,
  modelStatus,
  errorMessage,
  availableModels,
  selectedModel,
  onModelChange,
  onPingModel,
  isTestingModel,
  openQuotaLink,
}) => (
  <>
    <div className="mb-4 rounded-lg border border-gray-100 bg-gray-50 p-3">
      <label className="mb-2 block text-sm font-medium text-gray-700">AI provider</label>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onSelectProvider('claude')}
          className={`flex-1 rounded px-3 py-2 text-sm font-medium transition ${
            currentProvider === 'claude'
              ? 'bg-purple-600 text-white'
              : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
          }`}
        >
          Claude
        </button>
        <button
          type="button"
          onClick={() => onSelectProvider('gemini')}
          className={`flex-1 rounded px-3 py-2 text-sm font-medium transition ${
            currentProvider === 'gemini'
              ? 'bg-blue-600 text-white'
              : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
          }`}
        >
          Gemini
        </button>
      </div>
    </div>

    <div className={`rounded-lg border p-3 ${info.bgColor} ${info.borderColor}`}>
      <h3 className={`mb-2 flex items-center text-sm font-medium ${info.textColor}`}>
        <Key size={14} className="mr-1" />
        {info.name} API key
      </h3>
      <div className="flex space-x-2">
        <input
          type="password"
          value={localApiKey}
          onChange={(e) => onLocalApiKeyChange(e.target.value)}
          placeholder={`Enter your ${info.name} API key…`}
          className={`relative z-10 flex-1 cursor-text rounded border px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-1 ${info.inputBorder} ${
            currentProvider === 'claude' ? 'focus:ring-purple-500' : 'focus:ring-blue-500'
          } bg-white`}
        />
        <button
          type="button"
          onClick={onSaveApiKeyClick}
          disabled={saveDisabled}
          className={`rounded px-3 py-1.5 text-sm text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${info.buttonBg} ${info.buttonHover}`}
        >
          Save
        </button>
      </div>
      <p className={`mt-2 flex items-center justify-between text-[10px] ${info.textColor}`}>
        <span>
          Required for AI chat. Get one at{' '}
          <button
            type="button"
            onClick={openVendorLink}
            className="cursor-pointer border-none bg-transparent p-0 underline hover:opacity-80"
          >
            {info.linkText}
          </button>
          .
        </span>
        {hasApiKey && <span className="ml-2 font-bold text-green-600">✓ Configured</span>}
      </p>

      {hasApiKey && (
        <div className="mt-4 border-t border-opacity-20 pt-4" style={{ borderColor: `var(--${info.color}-200)` }}>
          <div className="mb-1.5 flex items-center justify-between">
            <label className={`text-[10px] font-medium ${info.textColor}`}>Active {info.name} model</label>
            <div className="flex gap-2">
              {modelStatus === 'success' && (
                <button
                  type="button"
                  onClick={onPingModel}
                  className={`text-[10px] underline ${info.textColor} hover:opacity-80`}
                >
                  {isTestingModel ? 'Testing…' : 'Test'}
                </button>
              )}
              <button
                type="button"
                onClick={openQuotaLink}
                className="text-[10px] text-gray-500 underline hover:text-gray-700"
              >
                Quota
              </button>
            </div>
          </div>

          {modelStatus === 'loading' && (
            <div className={`animate-pulse text-[10px] italic opacity-60 ${info.textColor}`}>Scanning models…</div>
          )}

          {modelStatus === 'error' && (
            <div className="break-words text-[10px] italic text-red-500">Failed to load models: {errorMessage}</div>
          )}

          {modelStatus === 'success' && availableModels.length > 0 ? (
            <select
              value={selectedModel}
              onChange={onModelChange}
              className={`mt-1 w-full rounded border bg-white px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-1 ${info.inputBorder} ${
                currentProvider === 'claude' ? 'focus:ring-purple-500' : 'focus:ring-blue-500'
              }`}
            >
              {availableModels.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          ) : modelStatus === 'success' ? (
            <div className="text-[10px] italic text-gray-500">No models found.</div>
          ) : null}
        </div>
      )}
    </div>
  </>
);

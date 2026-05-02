import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { FolderOpen, PlusCircle, CheckCircle, Key } from 'lucide-react';
import { bridge } from '../services/bridge';
import { MapInfoData, MapInfosReadData, TilesetInspectorData } from '../../shared/types';

type AIProvider = 'claude' | 'gemini';

interface ProjectSelectorProps {
  onProjectSelect: (path: string) => void;
  currentPath: string | null;
  hasApiKey: boolean | null;
  onSaveApiKey: (key: string) => void;
  keyVersion: number;
  onProviderChange?: () => void;
  selectedTemplateMapId: number | null;
  onTemplateMapChange: (mapId: number | null) => void;
  mapInfos: MapInfosReadData | null;
  mapListLoading?: boolean;
  onMapRegistryChanged?: (selectNewMapId?: number) => void | Promise<void>;
  tilesetInspectFromPreview?: { mapId: number; nonce: number } | null;
  onTilesetInspectFromPreviewClosed?: () => void;
}

const ProjectSelector: React.FC<ProjectSelectorProps> = ({
  onProjectSelect,
  currentPath,
  hasApiKey,
  onSaveApiKey,
  keyVersion,
  onProviderChange,
  selectedTemplateMapId,
  onTemplateMapChange,
  mapInfos,
  mapListLoading = false,
  onMapRegistryChanged,
  tilesetInspectFromPreview,
  onTilesetInspectFromPreviewClosed,
}) => {
  const [newProjectPath, setNewProjectPath] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [localApiKey, setLocalApiKey] = useState('');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [modelStatus, setModelStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [isTestingModel, setIsTestingModel] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [currentProvider, setCurrentProvider] = useState<AIProvider>('gemini');
  const [tilesetInspector, setTilesetInspector] = useState<TilesetInspectorData | null>(null);
  const [tilesetInspectorError, setTilesetInspectorError] = useState('');
  const [tilesetInspectorLoading, setTilesetInspectorLoading] = useState(false);
  const mapList = useMemo(() => {
    if (!mapInfos) return [];
    return (Object.values(mapInfos) as MapInfoData[])
      .map((info) => ({ id: info.id, name: info.name }))
      .sort((a, b) => a.id - b.id);
  }, [mapInfos]);
  const tilesetCanvasRef = useRef<HTMLCanvasElement>(null);
  const tilesetImageRef = useRef<HTMLImageElement>(null);
  const [mapTestRunning, setMapTestRunning] = useState(false);
  const [mapTestResult, setMapTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    const fetchProvider = async () => {
      try {
        const provider = await bridge.invoke('get-ai-provider');
        setCurrentProvider(provider || 'gemini');
      } catch (e) {
        console.error('Failed to fetch provider:', e);
      }
    };
    fetchProvider();
  }, []);

  useEffect(() => {
    if (hasApiKey) {
      const fetchModels = async () => {
        setModelStatus('loading');
        setErrorMessage('');
        try {
          const models = await bridge.invoke('debug-list-models');
          if (Array.isArray(models)) {
            setAvailableModels(models);
            if (models.length > 0 && !selectedModel) {
              setSelectedModel(models[0]);
            }
            setModelStatus('success');
          } else if (models && models.error) {
            setErrorMessage(models.error);
            setModelStatus('error');
          } else {
            setErrorMessage('Invalid response from server');
            setModelStatus('error');
          }
        } catch (e: any) {
          setErrorMessage(e.message || 'Unknown network error');
          setModelStatus('error');
        }
      };
      fetchModels();
    }
  }, [hasApiKey, keyVersion, currentProvider]);

  useEffect(() => {
    if (!tilesetInspector) return;

    const img = tilesetImageRef.current;
    const canvas = tilesetCanvasRef.current;
    if (!img || !canvas) return;

    const handleDraw = () => {
      const tileSize = tilesetInspector.tileWidth;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);

      ctx.font = '10px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      const cols = Math.floor(img.naturalWidth / tileSize);
      const rows = Math.floor(img.naturalHeight / tileSize);

      let tileId = 384;
      for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < cols; x += 1) {
          const px = x * tileSize;
          const py = y * tileSize;

          ctx.fillStyle = 'rgba(0,0,0,0.6)';
          ctx.fillRect(px, py, 26, 12);
          ctx.fillStyle = '#ffffff';
          ctx.fillText(String(tileId), px + 2, py + 1);

          tileId += 1;
        }
      }
    };

    if (img.complete) {
      handleDraw();
    } else {
      img.onload = handleDraw;
    }
  }, [tilesetInspector]);

  useEffect(() => {
    if (!currentPath) return;
    if (mapInfos && mapList.length > 0 && selectedTemplateMapId === null) {
      onTemplateMapChange(mapList[0].id);
    }
  }, [currentPath, mapInfos, mapList, selectedTemplateMapId, onTemplateMapChange]);

  const handleProviderChange = async (provider: AIProvider) => {
    if (provider === currentProvider) return; // Already on this provider
    
    try {
      console.log(`Switching to ${provider}...`);
      const result = await bridge.invoke('set-ai-provider', provider === 'claude');
      console.log('Provider switch result:', result);
      if (result && result.provider) {
        setCurrentProvider(result.provider);
        setSelectedModel(''); // Reset model selection
        setAvailableModels([]);
        setModelStatus('idle');
        // Notify parent to re-check API key for new provider
        if (onProviderChange) {
          await onProviderChange();
        }
      } else {
        console.error('Invalid provider switch result:', result);
      }
    } catch (e) {
      console.error('Failed to set provider:', e);
      setTestResult({ success: false, message: `Failed to switch provider: ${e instanceof Error ? e.message : String(e)}` });
    }
  };

  const handleModelChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const model = e.target.value;
    setSelectedModel(model);
    await bridge.invoke('set-active-model', model);
  };

  const handleTestModel = async () => {
    setIsTestingModel(true);
    setTestResult(null);
    try {
      const response = await bridge.invoke('ping');
      if (response && response.success) {
        setTestResult({ success: true, message: `Connected! Working model: ${response.model}` });
      } else {
        const msg = response?.error || JSON.stringify(response, null, 2) || 'Unknown error';
        setTestResult({ success: false, message: `Failed:\n\n${msg}` });
      }
    } catch (e: any) {
      setTestResult({ success: false, message: `Error:\n\n${e.message}` });
    } finally {
      setIsTestingModel(false);
    }
  };

  const isBrowserMode = !window.electron;

  const handleSelectExisting = async () => {
    if (isBrowserMode) {
      const typed = prompt('Enter the full path to your Pokemon Essentials project:');
      if (typed?.trim()) onProjectSelect(typed.trim());
      return;
    }
    const path = await bridge.invoke('select-directory');
    if (path) onProjectSelect(path);
  };

  const handleSelectNewDestination = async () => {
    if (isBrowserMode) {
      const typed = prompt('Enter the full path for the new project:');
      if (typed?.trim()) setNewProjectPath(typed.trim());
      return;
    }
    const path = await bridge.invoke('select-directory');
    if (path) setNewProjectPath(path);
  };

  const handleInit = async () => {
    if (!newProjectPath) return;
    setIsInitializing(true);
    try {
      const success = await bridge.invoke('init-project', newProjectPath);
      if (success) {
        onProjectSelect(newProjectPath);
        setNewProjectPath(null);
        setTestResult({ success: true, message: 'Project initialized!' });
      } else {
        setTestResult({ success: false, message: 'Initialization failed.' });
      }
    } finally {
      setIsInitializing(false);
    }
  };

  const loadTilesetInspectorForMap = useCallback(
    async (mapId: number) => {
      if (!currentPath) {
        setTilesetInspectorError('Please select a project first.');
        setTilesetInspector(null);
        return;
      }
      setTilesetInspectorError('');
      setTilesetInspectorLoading(true);
      try {
        const result = await bridge.invoke('tileset-inspector', {
          projectPath: currentPath,
          mapId,
        });
        if (result.success) {
          setTilesetInspector(result.data);
        } else {
          setTilesetInspector(null);
          setTilesetInspectorError(result.error || 'Failed to load tileset inspector.');
        }
      } catch (e: any) {
        setTilesetInspector(null);
        setTilesetInspectorError(e.message || 'Failed to load tileset inspector.');
      } finally {
        setTilesetInspectorLoading(false);
      }
    },
    [currentPath]
  );

  const closeTilesetInspector = () => {
    setTilesetInspector(null);
    onTilesetInspectFromPreviewClosed?.();
  };

  useEffect(() => {
    if (!tilesetInspectFromPreview || !currentPath) return;
    void loadTilesetInspectorForMap(tilesetInspectFromPreview.mapId);
  }, [tilesetInspectFromPreview, currentPath, loadTilesetInspectorForMap]);

  const handleOpenTilesetInspector = async () => {
    if (!currentPath) {
      setTilesetInspectorError('Please select a project first.');
      setTilesetInspector(null);
      return;
    }
    if (!selectedTemplateMapId) {
      setTilesetInspectorError('Please select a template map first.');
      setTilesetInspector(null);
      return;
    }
    await loadTilesetInspectorForMap(selectedTemplateMapId);
  };

  const handleRunMapTest = async (testType: 'ai' | 'sanity' | 'object') => {
    if (!currentPath) {
      setMapTestResult({ success: false, message: 'Please select a project first.' });
      return;
    }
    if (!selectedTemplateMapId) {
      setMapTestResult({ success: false, message: 'Please select a template map first.' });
      return;
    }
    setMapTestRunning(true);
    setMapTestResult(null);
    try {
      const selectedMap = mapList.find((m) => m.id === selectedTemplateMapId);
      const result = await bridge.invoke('run-map-test', {
        projectPath: currentPath,
        mapName: selectedMap?.name ?? `Map${selectedTemplateMapId}`,
        mapId: selectedTemplateMapId,
        testType
      });
      if (result.success) {
        let debug = '';
        if (result.debug?.coherenceScore) {
          debug = ` [${result.debug.coherenceScore}]`;
        } else if (result.debug?.editsCount) {
          const bounds = result.debug.editsBounds
            ? ` bounds(${result.debug.editsBounds.minX},${result.debug.editsBounds.minY})-(${result.debug.editsBounds.maxX},${result.debug.editsBounds.maxY})`
            : '';
          debug = ` [edits:${result.debug.editsCount}${bounds}]`;
        } else if (result.debug) {
          debug = ` [base:${result.debug.baseTile}, path:${result.debug.pathTile}, water:${result.debug.waterTile}, decor:${result.debug.decorTile}, elev:${result.debug.elevationTile}, stair:${result.debug.stairTile}]`;
        }
        const sourceInfo = result.sourceMapId
          ? ` source:${result.sourceMapId} (${result.sourceMapName || 'unknown'})`
          : '';
        setMapTestResult({ success: true, message: `Created Map${String(result.mapId).padStart(3, '0')} (${result.mapData.name}).${debug}${sourceInfo}` });
        if (onMapRegistryChanged) await Promise.resolve(onMapRegistryChanged(result.mapId));
      } else {
        setMapTestResult({ success: false, message: result.error || 'Test failed.' });
      }
    } catch (e: any) {
      setMapTestResult({ success: false, message: e.message || 'Test failed.' });
    } finally {
      setMapTestRunning(false);
    }
  };

  const providerInfo = {
    claude: {
      name: 'Claude',
      color: 'purple',
      bgColor: 'bg-purple-50',
      borderColor: 'border-purple-100',
      textColor: 'text-purple-800',
      inputBorder: 'border-purple-200',
      buttonBg: 'bg-purple-600',
      buttonHover: 'hover:bg-purple-700',
      linkUrl: 'https://console.anthropic.com/',
      linkText: 'Anthropic Console',
      defaultModel: 'claude-3-5-sonnet-20241022'
    },
    gemini: {
      name: 'Gemini',
      color: 'blue',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-100',
      textColor: 'text-blue-800',
      inputBorder: 'border-blue-200',
      buttonBg: 'bg-blue-600',
      buttonHover: 'hover:bg-blue-700',
      linkUrl: 'https://aistudio.google.com/',
      linkText: 'Google AI Studio',
      defaultModel: 'gemini-2.5-flash'
    }
  };

  const info = providerInfo[currentProvider];

  return (
    <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-4">
      <h2 className="text-lg font-semibold mb-4 text-gray-800">Configuration</h2>
      
      {/* Provider Selection */}
      <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-100">
        <label className="text-sm font-medium text-gray-700 mb-2 block">
          AI Provider
        </label>
        <div className="flex gap-2">
          <button
            onClick={() => handleProviderChange('claude')}
            className={`flex-1 px-3 py-2 rounded text-sm font-medium transition ${
              currentProvider === 'claude'
                ? 'bg-purple-600 text-white'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            Claude
          </button>
          <button
            onClick={() => handleProviderChange('gemini')}
            className={`flex-1 px-3 py-2 rounded text-sm font-medium transition ${
              currentProvider === 'gemini'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            Gemini
          </button>
        </div>
      </div>

      {/* API Key Input */}
      <div className={`mb-6 p-3 ${info.bgColor} rounded-lg border ${info.borderColor}`}>
        <h3 className={`text-sm font-medium ${info.textColor} flex items-center mb-2`}>
          <Key size={14} className="mr-1" />
          {info.name} API Key
        </h3>
        <div className="flex space-x-2">
          <input
            type="password"
            value={localApiKey}
            onChange={(e) => setLocalApiKey(e.target.value)}
            placeholder={`Enter your ${info.name} API Key...`}
            className={`flex-1 px-3 py-1.5 text-sm border ${info.inputBorder} rounded focus:outline-none focus:ring-1 ${currentProvider === 'claude' ? 'focus:ring-purple-500' : 'focus:ring-blue-500'} text-gray-900 bg-white relative z-10 cursor-text`}
          />
          <button
            onClick={async () => {
              try {
                const success = await bridge.invoke('set-api-key', { apiKey: localApiKey, provider: currentProvider });
                if (success) {
                  onSaveApiKey(localApiKey);
                  setLocalApiKey('');
                  // Trigger provider change callback to refresh API key status
                  if (onProviderChange) {
                    onProviderChange();
                  }
                }
              } catch (e: any) {
                console.error('Failed to save API key:', e);
                setTestResult({ success: false, message: `Failed to save API key: ${e.message}` });
              }
            }}
            disabled={!localApiKey.trim()}
            className={`px-3 py-1.5 ${info.buttonBg} text-white text-sm rounded ${info.buttonHover} transition disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            Save
          </button>
        </div>
        <p className={`mt-2 text-[10px] ${info.textColor} flex justify-between items-center`}>
          <span>
            Required for AI chat. Get one at{' '}
            <button 
              onClick={() => bridge.invoke('open-external-url', info.linkUrl)}
              className="underline hover:opacity-80 bg-transparent border-none p-0 cursor-pointer"
            >
              {info.linkText}
            </button>.
          </span>
          {hasApiKey && <span className="text-green-600 font-bold ml-2">✓ Configured</span>}
        </p>

        {hasApiKey && (
          <div className="mt-4 pt-4 border-t border-opacity-20" style={{ borderColor: `var(--${info.color}-200)` }}>
            <div className="flex justify-between items-center mb-1.5">
              <label className={`text-[10px] font-medium ${info.textColor}`}>
                Active {info.name} Model
              </label>
              <div className="flex gap-2">
                {modelStatus === 'success' && (
                  <button
                    onClick={handleTestModel}
                    className={`text-[10px] ${info.textColor} hover:opacity-80 underline`}
                  >
                    {isTestingModel ? 'Testing...' : 'Test'}
                  </button>
                )}
                <button
                  onClick={() => bridge.invoke('open-external-url', currentProvider === 'claude' ? 'https://docs.anthropic.com/claude/reference/rate-limits' : 'https://ai.dev/rate-limit')}
                  className="text-[10px] text-gray-500 hover:text-gray-700 underline"
                >
                  Quota
                </button>
              </div>
            </div>
            
            {modelStatus === 'loading' && (
              <div className={`text-[10px] ${info.textColor} opacity-60 animate-pulse italic`}>
                Scanning models...
              </div>
            )}
            
            {modelStatus === 'error' && (
              <div className="text-[10px] text-red-500 italic break-words">
                Failed to load models: {errorMessage}
              </div>
            )}
            
            {modelStatus === 'success' && availableModels.length > 0 ? (
              <div className="space-y-2">
                <select
                  value={selectedModel}
                  onChange={handleModelChange}
                  className={`w-full px-2 py-1.5 text-xs border ${info.inputBorder} rounded bg-white text-gray-700 focus:outline-none focus:ring-1 ${currentProvider === 'claude' ? 'focus:ring-purple-500' : 'focus:ring-blue-500'}`}
                >
                  {availableModels.map(model => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
                
                {testResult && (
                  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
                    <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6 flex flex-col max-h-[80vh]">
                      <div className="flex justify-between items-center mb-4">
                        <h3 className={`text-lg font-bold ${testResult.success ? 'text-green-600' : 'text-red-600'}`}>
                          {testResult.success ? 'Success' : 'Connection Error'}
                        </h3>
                        <button onClick={() => setTestResult(null)} className="text-gray-400 hover:text-gray-600">✕</button>
                      </div>
                      <div className="flex-1 overflow-y-auto bg-gray-50 p-4 rounded border border-gray-200 text-xs font-mono break-all whitespace-pre-wrap select-text cursor-text leading-relaxed">
                        {testResult.message}
                      </div>
                      <button 
                        onClick={() => setTestResult(null)}
                        className="mt-4 w-full py-2 bg-gray-800 text-white rounded hover:bg-black transition"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : modelStatus === 'success' && (
              <div className="text-[10px] text-gray-500 italic">
                No models found.
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-700 uppercase tracking-wider">Open Existing</h3>
          <button
            onClick={handleSelectExisting}
            className="w-full flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
          >
            <FolderOpen size={18} className="mr-2" />
            {currentPath ? 'Change Project' : 'Select Project'}
          </button>
          <div className="text-xs text-gray-500 truncate bg-gray-50 p-2 rounded border border-gray-100">
            {currentPath || 'No project selected'}
          </div>
        </div>

        <div className="space-y-3 border-l pl-6 border-gray-100">
          <h3 className="text-sm font-medium text-gray-700 uppercase tracking-wider">Create New</h3>
          <div className="flex flex-col space-y-2">
            <button
              onClick={handleSelectNewDestination}
              className="w-full flex items-center justify-center px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition"
            >
              <PlusCircle size={18} className="mr-2" />
              {newProjectPath ? 'Change Destination' : 'Select Destination'}
            </button>
            <div className="text-xs text-gray-500 truncate bg-gray-50 p-2 rounded border border-gray-100 min-h-[32px]">
              {newProjectPath || 'No destination'}
            </div>
            <button
              onClick={handleInit}
              disabled={!newProjectPath || isInitializing}
              className={`w-full flex items-center justify-center px-4 py-2 text-white rounded transition ${
                !newProjectPath || isInitializing ? 'bg-gray-300 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              {isInitializing ? 'Initializing...' : 'Init New Project'}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-6 pt-4 border-t border-gray-200">
        <h3 className="text-sm font-medium text-gray-700 uppercase tracking-wider mb-2">Template Map</h3>
        <div className="flex gap-2">
          <select
            value={selectedTemplateMapId ?? ''}
            onChange={(e) => {
              const val = e.target.value;
              onTemplateMapChange(val === '' ? null : Number(val));
            }}
            disabled={!currentPath || mapListLoading}
            className="flex-1 px-3 py-2 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
          >
            {!currentPath ? (
              <option value="">Select a project first</option>
            ) : mapListLoading ? (
              <option value="">Loading maps...</option>
            ) : (
              <>
                <option value="">None (blank map)</option>
                {mapList.map((m) => (
                  <option key={m.id} value={m.id}>
                    Map{String(m.id).padStart(3, '0')} -- {m.name}
                  </option>
                ))}
              </>
            )}
          </select>
          <button
            onClick={handleOpenTilesetInspector}
            disabled={tilesetInspectorLoading || !selectedTemplateMapId}
            className="px-3 py-2 bg-gray-800 text-white text-xs rounded hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {tilesetInspectorLoading ? 'Loading...' : 'Show Tileset IDs'}
          </button>
        </div>
        {tilesetInspectorError && (
          <div className="mt-2 text-xs text-red-600">{tilesetInspectorError}</div>
        )}

        <div className="mt-4">
          <h4 className="text-xs font-semibold text-gray-700 mb-2">POC Map Tests</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            <button
              onClick={() => handleRunMapTest('sanity')}
              disabled={mapTestRunning || !selectedTemplateMapId}
              className="px-3 py-2 bg-slate-700 text-white text-xs rounded hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Sanity Test
            </button>
            <button
              onClick={() => handleRunMapTest('ai')}
              disabled={mapTestRunning || !hasApiKey || !selectedTemplateMapId}
              className="px-3 py-2 bg-purple-600 text-white text-xs rounded hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
              title={!hasApiKey ? 'AI key required' : !selectedTemplateMapId ? 'Select a template map' : 'AI-driven scattered edits'}
            >
              Run AI Tests
            </button>
            <button
              onClick={() => handleRunMapTest('object')}
              disabled={mapTestRunning || !hasApiKey || !selectedTemplateMapId}
              className="px-3 py-2 bg-emerald-600 text-white text-xs rounded hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
              title={!hasApiKey ? 'AI key required' : !selectedTemplateMapId ? 'Select a template map' : 'Place coherent multi-tile objects (trees, etc.)'}
            >
              Object Test
            </button>
          </div>
          {mapTestResult && (
            <div className={`mt-2 text-xs ${mapTestResult.success ? 'text-green-600' : 'text-red-600'}`}>
              {mapTestResult.message}
            </div>
          )}
        </div>
      </div>

      {tilesetInspector && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full p-6 flex flex-col max-h-[90vh] overflow-hidden">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-800">Tileset IDs</h3>
                <p className="text-xs text-gray-500">
                  Map: {tilesetInspector.mapName} (ID {tilesetInspector.mapId}) · Tileset {tilesetInspector.tilesetId}
                </p>
              </div>
              <button onClick={closeTilesetInspector} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="flex flex-col">
                <h4 className="text-xs font-semibold text-gray-700 mb-2">Regular Tiles</h4>
            <div className="flex-1 overflow-auto border border-gray-200 rounded bg-gray-50 p-2 max-h-[60vh]">
                  <div className="relative inline-block">
                    <img
                      ref={tilesetImageRef}
                      src={tilesetInspector.tilesetImageDataUrl || tilesetInspector.tilesetImageUrl}
                      alt="Tileset"
                      className="block max-w-full h-auto"
                    />
                    <canvas ref={tilesetCanvasRef} className="absolute left-0 top-0 pointer-events-none" />
                  </div>
                </div>
              </div>

              <div className="flex flex-col">
                <h4 className="text-xs font-semibold text-gray-700 mb-2">Autotiles</h4>
                <div className="flex-1 overflow-auto border border-gray-200 rounded bg-gray-50 p-2 max-h-[60vh]">
                  {(tilesetInspector.autotileImageDataUrls || []).some((u, i) => !!(u || tilesetInspector.autotileImageUrls?.[i])) ? (
                    <div className="grid grid-cols-2 gap-3">
                      {(tilesetInspector.autotileImageDataUrls || []).map((dataUrl, index) => {
                        const src = dataUrl || tilesetInspector.autotileImageUrls?.[index];
                        if (!src) return null;
                        return (
                        <div key={index} className="bg-white border border-gray-200 rounded p-2">
                          <img
                            src={src}
                            alt={`Autotile ${index + 1}`}
                            className="block w-full h-auto max-h-28 object-contain"
                          />
                          <div className="mt-1 text-[10px] text-gray-500 truncate">
                            {tilesetInspector.autotileImagePaths?.[index] || `Autotile ${index + 1}`}
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-xs text-gray-500">No autotiles configured.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectSelector;

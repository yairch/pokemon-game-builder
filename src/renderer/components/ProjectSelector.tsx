import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { HelpCircle } from 'lucide-react';
import { bridge } from '../services/bridge';
import { MapInfoData, MapInfosReadData, TilesetInspectorData } from '../../shared/types';
import { HeaderPopover } from './workbench/HeaderPopover';
import { WorkbenchProjectPanel } from './workbench/panels/WorkbenchProjectPanel';
import { WorkbenchAiPanel } from './workbench/panels/WorkbenchAiPanel';
import type { WorkbenchAIProvider } from './workbench/panels/WorkbenchAiPanel';
import { WorkbenchTemplatePanel } from './workbench/panels/WorkbenchTemplatePanel';
import { WorkbenchHelpPanel } from './workbench/panels/WorkbenchHelpPanel';
import { ConnectionResultModal } from './workbench/modals/ConnectionResultModal';
import { WorkbenchTilesetInspectorModal } from './workbench/modals/WorkbenchTilesetInspectorModal';

type AIProvider = WorkbenchAIProvider;
type WorkbenchHeaderPanel = 'project' | 'ai' | 'template' | 'tests' | 'help';

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
  const [mapTestRunning, setMapTestRunning] = useState(false);
  const [mapTestResult, setMapTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [headerPanel, setHeaderPanel] = useState<WorkbenchHeaderPanel | null>(null);

  const openHeaderPanel = (panel: WorkbenchHeaderPanel, open: boolean) => {
    setHeaderPanel(open ? panel : null);
  };

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
    if (!currentPath) return;
    if (mapInfos && mapList.length > 0 && selectedTemplateMapId === null) {
      onTemplateMapChange(mapList[0].id);
    }
  }, [currentPath, mapInfos, mapList, selectedTemplateMapId, onTemplateMapChange]);

  const handleProviderChange = async (provider: AIProvider) => {
    if (provider === currentProvider) return;

    try {
      const result = await bridge.invoke('set-ai-provider', provider === 'claude');
      if (result && result.provider) {
        setCurrentProvider(result.provider);
        setSelectedModel('');
        setAvailableModels([]);
        setModelStatus('idle');
        if (onProviderChange) {
          await onProviderChange();
        }
      }
    } catch (e) {
      console.error('Failed to set provider:', e);
      setTestResult({
        success: false,
        message: `Failed to switch provider: ${e instanceof Error ? e.message : String(e)}`,
      });
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

  const isBrowserMode = !(window as unknown as { electron?: { invoke: unknown } }).electron;

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
        testType,
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
        setMapTestResult({
          success: true,
          message: `Created Map${String(result.mapId).padStart(3, '0')} (${result.mapData.name}).${debug}${sourceInfo}`,
        });
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
      defaultModel: 'claude-3-5-sonnet-20241022',
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
      defaultModel: 'gemini-2.5-flash',
    },
  };

  const info = providerInfo[currentProvider];

  const saveApiKeyFromToolbar = async () => {
    try {
      const success = await bridge.invoke('set-api-key', { apiKey: localApiKey, provider: currentProvider });
      if (success) {
        onSaveApiKey(localApiKey);
        setLocalApiKey('');
        if (onProviderChange) {
          onProviderChange();
        }
      }
    } catch (e: any) {
      console.error('Failed to save API key:', e);
      setTestResult({ success: false, message: `Failed to save API key: ${e.message}` });
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <HeaderPopover
          label="Project"
          isOpen={headerPanel === 'project'}
          onOpenChange={(o) => openHeaderPanel('project', o)}
          panelMaxWidthPx={420}
        >
          <WorkbenchProjectPanel
            currentPath={currentPath}
            newProjectPath={newProjectPath}
            isInitializing={isInitializing}
            onSelectExisting={() => void handleSelectExisting()}
            onSelectNewDestination={() => void handleSelectNewDestination()}
            onInit={() => void handleInit()}
          />
        </HeaderPopover>

        <HeaderPopover
          label="AI"
          isOpen={headerPanel === 'ai'}
          onOpenChange={(o) => openHeaderPanel('ai', o)}
        >
          <WorkbenchAiPanel
            currentProvider={currentProvider}
            onSelectProvider={(p) => void handleProviderChange(p)}
            info={info}
            localApiKey={localApiKey}
            onLocalApiKeyChange={setLocalApiKey}
            onSaveApiKeyClick={() => void saveApiKeyFromToolbar()}
            saveDisabled={!localApiKey.trim()}
            hasApiKey={hasApiKey}
            openVendorLink={() => void bridge.invoke('open-external-url', info.linkUrl)}
            modelStatus={modelStatus}
            errorMessage={errorMessage}
            availableModels={availableModels}
            selectedModel={selectedModel}
            onModelChange={(e) => void handleModelChange(e)}
            onPingModel={() => void handleTestModel()}
            isTestingModel={isTestingModel}
            openQuotaLink={() =>
              void bridge.invoke(
                'open-external-url',
                currentProvider === 'claude'
                  ? 'https://docs.anthropic.com/claude/reference/rate-limits'
                  : 'https://ai.dev/rate-limit'
              )
            }
          />
        </HeaderPopover>

        <HeaderPopover
          label="Template"
          isOpen={headerPanel === 'template'}
          onOpenChange={(o) => openHeaderPanel('template', o)}
          disabled={!currentPath}
          panelMaxWidthPx={440}
        >
          <WorkbenchTemplatePanel
            currentPath={currentPath}
            mapListLoading={mapListLoading}
            mapList={mapList}
            selectedTemplateMapId={selectedTemplateMapId}
            onTemplateMapChange={onTemplateMapChange}
            tilesetInspectorLoading={tilesetInspectorLoading}
            tilesetInspectorError={tilesetInspectorError}
            onOpenTilesetInspector={() => void handleOpenTilesetInspector()}
          />
        </HeaderPopover>

        <HeaderPopover
          label="Tests ▾"
          isOpen={headerPanel === 'tests'}
          onOpenChange={(o) => openHeaderPanel('tests', o)}
          accentWhenOpen
          align="right"
          panelMaxWidthPx={340}
        >
          <p className="mb-4 text-[12px] leading-snug text-gray-600">
            Runs use the template map from the Template menu.
          </p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              title="Quick sanity test (no AI)"
              onClick={() => void handleRunMapTest('sanity')}
              disabled={mapTestRunning || !selectedTemplateMapId || !currentPath}
              className="rounded-lg bg-slate-700 px-3 py-2.5 text-xs font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {mapTestRunning ? 'Running…' : 'Sanity test'}
            </button>
            <button
              type="button"
              onClick={() => void handleRunMapTest('ai')}
              disabled={mapTestRunning || !hasApiKey || !selectedTemplateMapId}
              className="rounded-lg bg-purple-600 px-3 py-2.5 text-xs font-medium text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              AI scattered edits
            </button>
            <button
              type="button"
              onClick={() => void handleRunMapTest('object')}
              disabled={mapTestRunning || !hasApiKey || !selectedTemplateMapId}
              className="rounded-lg bg-emerald-600 px-3 py-2.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Object placement test
            </button>
          </div>
          {mapTestResult && (
            <div
              className={`mt-4 rounded-lg border px-3 py-2.5 text-xs ${
                mapTestResult.success
                  ? 'border-green-200 bg-green-50 text-green-800'
                  : 'border-red-200 bg-red-50 text-red-800'
              }`}
            >
              {mapTestResult.message}
            </div>
          )}
        </HeaderPopover>

        <HeaderPopover
          label={
            <span className="inline-flex items-center gap-1.5">
              <HelpCircle size={17} strokeWidth={2} aria-hidden />
              <span>Help</span>
            </span>
          }
          isOpen={headerPanel === 'help'}
          onOpenChange={(o) => openHeaderPanel('help', o)}
          align="right"
          panelMaxWidthPx={360}
        >
          <WorkbenchHelpPanel />
        </HeaderPopover>
      </div>

      <ConnectionResultModal result={testResult} onClose={() => setTestResult(null)} />
      <WorkbenchTilesetInspectorModal data={tilesetInspector} onClose={closeTilesetInspector} />
    </>
  );
};

export default ProjectSelector;

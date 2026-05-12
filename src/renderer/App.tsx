import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ProjectSelector from './components/ProjectSelector';
import ChatInterface from './components/ChatInterface';
import MapPreview from './components/MapPreview';
import MapsTree from './components/MapsTree';
import { SplitPane } from './components/workbench/SplitPane';
import { bridge } from './services/bridge';
import type { MapData, MapInfosReadData } from '../shared/types';
import { buildMapInfosTree, getDefaultPreviewMapId } from '../shared/mapInfosTree';
import { mapReadDataToMapData } from '../shared/mapReadToMapData';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const App: React.FC = () => {
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [keyVersion, setKeyVersion] = useState(0);
  const [selectedTemplateMapId, setSelectedTemplateMapId] = useState<number | null>(null);

  const [mapInfos, setMapInfos] = useState<MapInfosReadData | null>(null);
  const [mapInfosLoading, setMapInfosLoading] = useState(false);
  const [previewMapId, setPreviewMapId] = useState<number | null>(null);
  const [previewMap, setPreviewMap] = useState<MapData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [inspectFromPreview, setInspectFromPreview] = useState<{ mapId: number; nonce: number } | null>(null);

  const reloadMapInfos = useCallback(async () => {
    if (!projectPath) return;
    try {
      const result = await bridge.invoke('read-map-infos', { projectPath });
      if (!result?.success || !result?.data) {
        console.error('read-map-infos failed:', result?.error ?? result);
        setMapInfos({});
        return;
      }
      setMapInfos(result.data as MapInfosReadData);
    } catch (e) {
      console.error('Failed to read map infos:', e);
      setMapInfos({});
    }
  }, [projectPath]);

  useEffect(() => {
    setMapInfos(null);
    setPreviewMapId(null);
    setPreviewMap(null);
    setPreviewError(null);
    setSelectedTemplateMapId(null);
    setInspectFromPreview(null);
  }, [projectPath]);

  useEffect(() => {
    if (!projectPath) {
      setMapInfosLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setMapInfosLoading(true);
      await reloadMapInfos();
      if (!cancelled) setMapInfosLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectPath, reloadMapInfos]);

  useEffect(() => {
    if (!mapInfos || mapInfosLoading) return;
    const keys = Object.keys(mapInfos);
    setPreviewMapId((prev) => {
      if (prev != null && keys.length > 0 && keys.includes(String(prev))) return prev;
      return getDefaultPreviewMapId(mapInfos);
    });
  }, [mapInfos, mapInfosLoading]);

  useEffect(() => {
    if (!projectPath || previewMapId == null) {
      setPreviewMap(null);
      setPreviewLoading(false);
      setPreviewError(null);
      return;
    }
    const mapInfosEntry =
      mapInfos && Object.prototype.hasOwnProperty.call(mapInfos, String(previewMapId))
        ? mapInfos[String(previewMapId)]
        : undefined;
    const mapNameFallback = mapInfosEntry?.name ?? `Map${String(previewMapId).padStart(3, '0')}`;
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError(null);

    bridge
      .invoke('read-map', { projectPath, mapId: previewMapId })
      .then((r) => {
        if (cancelled) return;
        if (!r?.success || !r?.data) {
          setPreviewError(r?.error || 'Could not read map.');
          setPreviewMap(null);
        } else {
          setPreviewMap(
            mapReadDataToMapData(previewMapId, mapNameFallback, r.data)
          );
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setPreviewMap(null);
        setPreviewError(err instanceof Error ? err.message : 'Could not read map.');
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectPath, previewMapId, mapInfos]);

  const handleMapRegistryChanged = useCallback(
    async (selectNewMapId?: number) => {
      if (!projectPath) return;
      setMapInfosLoading(true);
      try {
        const result = await bridge.invoke('read-map-infos', { projectPath });
        if (result?.success && result.data) setMapInfos(result.data as MapInfosReadData);
        if (selectNewMapId != null) setPreviewMapId(selectNewMapId);
      } finally {
        setMapInfosLoading(false);
      }
    },
    [projectPath]
  );

  const mapTreeRoots = useMemo(() => buildMapInfosTree(mapInfos ?? {}), [mapInfos]);

  useEffect(() => {
    const checkApiKey = async () => {
      const exists = await bridge.invoke('has-api-key');
      setHasApiKey(exists);
    };
    checkApiKey();
  }, []);

  const requestPreviewTilesetInspect = () => {
    if (previewMapId == null) return;
    setInspectFromPreview((prev) => ({
      mapId: previewMapId,
      nonce: (prev?.nonce ?? 0) + 1,
    }));
  };

  const handleSendMessage = async (content: string) => {
    const userMessage: Message = { role: 'user', content };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const response = await bridge.invoke('ai-chat', {
        message: content,
        projectPath,
        templateMapId: selectedTemplateMapId,
      });

      setMessages((prev) => [...prev, { role: 'assistant', content: response.text }]);
      if (response.mapData?.id != null) {
        await handleMapRegistryChanged(response.mapData.id);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateMap = async () => {
    const userMessage: Message = { role: 'user', content: 'Generate Map (POC)' };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const spec = await bridge.invoke('get-stub-map-spec');
      const result = await bridge.invoke('compile-map-spec', {
        projectPath,
        spec,
        templateMapId: selectedTemplateMapId,
      });

      if (result.success) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `POC map generated as Map${result.mapId.toString().padStart(3, '0')}.rxdata.`,
          },
        ]);
        await handleMapRegistryChanged(result.mapId);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `Error: ${result.error || 'Failed to generate map.'}` },
        ]);
      }
    } catch (error: any) {
      console.error('Error generating POC map:', error);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Error: Failed to generate map. Please try again.' },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveApiKey = async (newKey: string) => {
    const success = await bridge.invoke('set-api-key', newKey);
    if (success) {
      setHasApiKey(!!newKey);
      setKeyVersion((v) => v + 1);
    }
  };

  const handleProviderChange = async () => {
    const exists = await bridge.invoke('has-api-key');
    setHasApiKey(exists);
    setKeyVersion((v) => v + 1);
  };

  const treeBusy = Boolean(projectPath && (mapInfosLoading || mapInfos === null));
  const noMapsWhenReady =
    Boolean(projectPath) &&
    Boolean(mapInfos) &&
    Object.keys(mapInfos!).length === 0 &&
    !mapInfosLoading;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-zinc-100/90 select-text">
      <header className="sticky top-0 z-50 flex-shrink-0 border-b border-zinc-200/80 bg-white/95 px-4 py-2.5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/85">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold tracking-tight text-zinc-900">
              Pokémon <span className="text-blue-600">Game Builder</span>
            </h1>
            <p className="truncate font-mono text-[11px] text-zinc-500" title={projectPath ?? undefined}>
              {projectPath ?? 'No project loaded'}
            </p>
          </div>
          <ProjectSelector
            currentPath={projectPath}
            onProjectSelect={setProjectPath}
            hasApiKey={hasApiKey}
            onSaveApiKey={handleSaveApiKey}
            keyVersion={keyVersion}
            onProviderChange={handleProviderChange}
            selectedTemplateMapId={selectedTemplateMapId}
            onTemplateMapChange={setSelectedTemplateMapId}
            onMapRegistryChanged={handleMapRegistryChanged}
            mapInfos={mapInfos}
            mapListLoading={treeBusy}
            tilesetInspectFromPreview={inspectFromPreview}
            onTilesetInspectFromPreviewClosed={() => setInspectFromPreview(null)}
          />
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col px-3 pb-3 pt-2">
        <SplitPane
          orientation="horizontal"
          storageKey="gw-workbench-chat"
          defaultRatio={0.56}
          minPrimaryPx={280}
          minSecondaryPx={260}
          primary={
            <div className="flex min-h-0 min-w-0 flex-1 px-0.5">
              <SplitPane
                orientation="vertical"
                storageKey="gw-tree-preview"
                defaultRatio={0.34}
                minPrimaryPx={140}
                minSecondaryPx={200}
                primary={
                  projectPath ? (
                    <MapsTree
                      roots={mapTreeRoots}
                      selectedMapId={previewMapId}
                      onSelectMap={setPreviewMapId}
                      loading={treeBusy}
                      resetKey={projectPath}
                      fillWorkbench
                    />
                  ) : (
                    <div className="flex min-h-[120px] flex-1 items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-white/80 px-4 text-center text-[13px] text-zinc-500">
                      Open a project to browse maps.
                    </div>
                  )
                }
                secondary={
                  <MapPreview
                    mapData={previewMap}
                    projectPath={projectPath}
                    previewLoading={previewLoading}
                    previewLoadError={previewError}
                    noMapsInProject={noMapsWhenReady}
                    onInspectTileset={requestPreviewTilesetInspect}
                    fillWorkbench
                  />
                }
              />
            </div>
          }
          secondary={
            <div className="flex min-h-0 min-w-0 flex-1 flex-col pl-2">
              <ChatInterface
                messages={messages}
                onSendMessage={handleSendMessage}
                onGenerateMap={handleGenerateMap}
                isLoading={isLoading}
                hasApiKey={hasApiKey}
              />
            </div>
          }
        />
      </main>
    </div>
  );
};

export default App;

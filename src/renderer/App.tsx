import React, { useState, useEffect } from 'react';
import ProjectSelector from './components/ProjectSelector';
import ChatInterface from './components/ChatInterface';
import MapPreview from './components/MapPreview';
import { bridge } from './services/bridge';
import type { MapData } from '../shared/types';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const App: React.FC = () => {
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentMap, setCurrentMap] = useState<MapData | null>(null);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [keyVersion, setKeyVersion] = useState(0);
  const [selectedTemplateMapId, setSelectedTemplateMapId] = useState<number | null>(null);

  useEffect(() => {
    // Check if API key exists on startup
    const checkApiKey = async () => {
      const exists = await bridge.invoke('has-api-key');
      setHasApiKey(exists);
    };
    checkApiKey();
  }, []);

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
      if (response.mapData) {
        setCurrentMap(response.mapData);
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
          { role: 'assistant', content: `POC map generated as Map${result.mapId.toString().padStart(3, '0')}.rxdata.` }
        ]);
        if (result.mapData) {
          setCurrentMap(result.mapData);
        }
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `Error: ${result.error || 'Failed to generate map.'}` }
        ]);
      }
    } catch (error: any) {
      console.error('Error generating POC map:', error);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Error: Failed to generate map. Please try again.' }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveApiKey = async (newKey: string) => {
    const success = await bridge.invoke('set-api-key', newKey);
    if (success) {
      setHasApiKey(!!newKey);
      setKeyVersion(v => v + 1);
    }
  };

  const handleProviderChange = async () => {
    // Re-check API key when provider changes
    const exists = await bridge.invoke('has-api-key');
    setHasApiKey(exists);
    setKeyVersion(v => v + 1);
  };

  return (
    <div className="h-screen bg-gray-50 p-6 flex flex-col overflow-hidden select-text">
      <header className="mb-6 flex-shrink-0">
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
          Pokemon <span className="text-blue-600">Game Builder</span>
        </h1>
        <p className="text-sm text-gray-600 mt-1">AI-Powered RPG Maker XP Companion</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 overflow-hidden">
        <div className="lg:col-span-4 space-y-6 overflow-y-auto pr-2 custom-scrollbar">
          <ProjectSelector
            currentPath={projectPath}
            onProjectSelect={setProjectPath}
            hasApiKey={hasApiKey}
            onSaveApiKey={handleSaveApiKey}
            keyVersion={keyVersion}
            onProviderChange={handleProviderChange}
            selectedTemplateMapId={selectedTemplateMapId}
            onTemplateMapChange={setSelectedTemplateMapId}
            onMapPreviewUpdate={setCurrentMap}
          />
          <MapPreview mapData={currentMap} projectPath={projectPath} />
          
          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
            <h2 className="text-lg font-semibold mb-2">Instructions</h2>
            <ul className="text-sm text-gray-600 space-y-2 list-disc pl-4">
              <li>Select your Pokemon Essentials project folder.</li>
              <li>Ask the AI to create a map, event, or script.</li>
              <li>Changes are applied directly to your project files.</li>
              <li>Open RPG Maker XP to see the results.</li>
            </ul>
          </div>
        </div>

        <div className="lg:col-span-8 flex flex-col overflow-hidden">
          <ChatInterface
            messages={messages}
            onSendMessage={handleSendMessage}
            onGenerateMap={handleGenerateMap}
            isLoading={isLoading}
            hasApiKey={hasApiKey}
          />
        </div>
      </div>
    </div>
  );
};

export default App;

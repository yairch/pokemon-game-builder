import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleChatMapPipeline, ChatMapPipelineDeps } from '../chat-map-pipeline';

function createMockDeps(overrides: Partial<ChatMapPipelineDeps> = {}): ChatMapPipelineDeps {
  return {
    aiService: {
      chat: vi.fn().mockResolvedValue({ text: 'Hello!' }),
      ping: vi.fn(),
      listModels: vi.fn(),
    },
    mapGenerator: {
      generateMapFile: vi.fn().mockResolvedValue(undefined),
      registerMapInInfos: vi.fn().mockResolvedValue(undefined),
    },
    createProjectService: vi.fn().mockReturnValue({
      isValidProject: () => true,
      getNextMapId: vi.fn().mockResolvedValue(5),
    }),
    getCurrentProvider: () => 'claude',
    ...overrides,
  };
}

describe('handleChatMapPipeline', () => {
  it('returns API key prompt when aiService is null', async () => {
    const deps = createMockDeps({ aiService: null });
    const result = await handleChatMapPipeline(deps, 'hi', '/project');
    expect(result.text).toContain('Claude API key');
  });

  it('returns project prompt when projectPath is empty', async () => {
    const deps = createMockDeps();
    const result = await handleChatMapPipeline(deps, 'hi', '');
    expect(result.text).toContain('select a Pokemon Essentials project');
  });

  it('returns invalid project message when project is invalid', async () => {
    const deps = createMockDeps({
      createProjectService: () => ({
        isValidProject: () => false,
        getNextMapId: vi.fn(),
      }),
    });
    const result = await handleChatMapPipeline(deps, 'hi', '/project');
    expect(result.text).toContain('does not appear to be a valid');
  });

  it('passes through text-only AI responses without calling map methods', async () => {
    const deps = createMockDeps();
    const result = await handleChatMapPipeline(deps, 'What is a Pokemon?', '/project');

    expect(result.text).toBe('Hello!');
    expect(deps.mapGenerator.generateMapFile).not.toHaveBeenCalled();
    expect(deps.mapGenerator.registerMapInInfos).not.toHaveBeenCalled();
  });

  it('calls both generateMapFile and registerMapInInfos when AI returns mapData', async () => {
    const mapData: Record<string, any> = {
      name: 'Test Town',
      width: 20,
      height: 15,
      tilesetId: 1,
      layers: [[[384]]],
      events: [],
    };

    const deps = createMockDeps({
      aiService: {
        chat: vi.fn().mockResolvedValue({ text: 'Here is your map', mapData }),
        ping: vi.fn(),
        listModels: vi.fn(),
      },
    });

    const result = await handleChatMapPipeline(deps, 'Make a town', '/project');

    expect(deps.mapGenerator.generateMapFile).toHaveBeenCalledOnce();
    expect(deps.mapGenerator.generateMapFile).toHaveBeenCalledWith('/project', 5, mapData);

    expect(deps.mapGenerator.registerMapInInfos).toHaveBeenCalledOnce();
    expect(deps.mapGenerator.registerMapInInfos).toHaveBeenCalledWith('/project', 5, 'Test Town');

    expect(mapData.id).toBe(5);
    expect(result.text).toContain('Generated map "Test Town"');
    expect(result.text).toContain('Map005.rxdata');
  });

  it('does not call registerMapInInfos when generateMapFile fails', async () => {
    const mapData = {
      name: 'Broken Map',
      width: 20,
      height: 15,
      tilesetId: 1,
      layers: [[[384]]],
      events: [],
    };

    const deps = createMockDeps({
      aiService: {
        chat: vi.fn().mockResolvedValue({ text: 'Here is your map', mapData }),
        ping: vi.fn(),
        listModels: vi.fn(),
      },
      mapGenerator: {
        generateMapFile: vi.fn().mockRejectedValue(new Error('Ruby not found')),
        registerMapInInfos: vi.fn().mockResolvedValue(undefined),
      },
    });

    const result = await handleChatMapPipeline(deps, 'Make a town', '/project');

    expect(deps.mapGenerator.generateMapFile).toHaveBeenCalledOnce();
    expect(deps.mapGenerator.registerMapInInfos).not.toHaveBeenCalled();
    expect(result.text).toContain('Failed to generate map file');
    expect(result.text).toContain('Ruby not found');
  });

  it('returns error text when aiService.chat throws', async () => {
    const deps = createMockDeps({
      aiService: {
        chat: vi.fn().mockRejectedValue(new Error('Rate limited')),
        ping: vi.fn(),
        listModels: vi.fn(),
      },
    });

    const result = await handleChatMapPipeline(deps, 'hi', '/project');
    expect(result.text).toContain('Error: Rate limited');
  });

  it('assigns the correct next map ID to mapData', async () => {
    const mapData: Record<string, any> = {
      name: 'ID Check',
      width: 10,
      height: 10,
      tilesetId: 1,
      layers: [[[0]]],
      events: [],
    };

    const deps = createMockDeps({
      aiService: {
        chat: vi.fn().mockResolvedValue({ text: 'Map', mapData }),
        ping: vi.fn(),
        listModels: vi.fn(),
      },
      createProjectService: () => ({
        isValidProject: () => true,
        getNextMapId: vi.fn().mockResolvedValue(42),
      }),
    });

    await handleChatMapPipeline(deps, 'Make a map', '/project');

    expect(mapData.id).toBe(42);
    expect(deps.mapGenerator.generateMapFile).toHaveBeenCalledWith('/project', 42, mapData);
    expect(deps.mapGenerator.registerMapInInfos).toHaveBeenCalledWith('/project', 42, 'ID Check');
  });
});

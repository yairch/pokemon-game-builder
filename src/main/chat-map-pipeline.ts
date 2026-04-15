import { IAIService } from './ai-service-base';

export interface MapGeneratorLike {
  generateMapFile(projectPath: string, mapId: number, mapData: any): Promise<void>;
  registerMapInInfos(projectPath: string, mapId: number, name: string): Promise<void>;
  cloneMapFile(projectPath: string, sourceMapId: number, targetMapId: number): Promise<void>;
  patchMapData(projectPath: string, mapId: number, mapData: any): Promise<void>;
}

export interface ProjectServiceLike {
  isValidProject(): boolean;
  getNextMapId(): Promise<number>;
}

export interface ChatMapPipelineDeps {
  aiService: IAIService | null;
  mapGenerator: MapGeneratorLike;
  createProjectService: (projectPath: string) => ProjectServiceLike;
  getCurrentProvider: () => string;
}

export async function handleChatMapPipeline(
  deps: ChatMapPipelineDeps,
  message: string,
  projectPath: string,
  templateMapId?: number | null
): Promise<any> {
  const { aiService, mapGenerator, createProjectService, getCurrentProvider } = deps;

  if (!aiService) {
    const provider = getCurrentProvider();
    return { text: `Please set your ${provider === 'claude' ? 'Claude' : 'Gemini'} API key.` };
  }

  if (!projectPath) {
    return { text: 'Please select a Pokemon Essentials project first.' };
  }

  const projectService = createProjectService(projectPath);
  if (!projectService.isValidProject()) {
    return { text: 'The selected directory does not appear to be a valid Pokemon Essentials project.' };
  }

  const context = { projectPath };

  try {
    const response = await aiService.chat(message, context);

    if (response.mapData) {
      const nextId = await projectService.getNextMapId();
      response.mapData.id = nextId;

      try {
        if (templateMapId) {
          await mapGenerator.cloneMapFile(projectPath, templateMapId, nextId);
          await mapGenerator.patchMapData(projectPath, nextId, response.mapData);
        } else {
          await mapGenerator.generateMapFile(projectPath, nextId, response.mapData);
        }
        await mapGenerator.registerMapInInfos(projectPath, nextId, response.mapData.name);
        const baseInfo = templateMapId ? ` (based on Map${String(templateMapId).padStart(3, '0')})` : '';
        response.text += `\n\nGenerated map "${response.mapData.name}" as Map${nextId.toString().padStart(3, '0')}.rxdata${baseInfo}.`;
      } catch (err: any) {
        response.text += `\n\nFailed to generate map file: ${err.message}`;
      }
    }

    return response;
  } catch (error: any) {
    return { text: `Error: ${error.message}` };
  }
}

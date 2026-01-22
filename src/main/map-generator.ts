import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs-extra';
import { app } from 'electron';
import {
  MapData,
  MapSpec,
  MapEventSpec,
  MapReadData,
  MapInfosReadData,
  TilesetData,
  SystemReadData
} from '../shared/types';

export class MapGenerator {
  private rubyScriptPath: string;

  constructor() {
    this.rubyScriptPath = this.resolveRubyBridgePath();
  }

  private resolveRubyBridgePath(): string {
    const packagedPath = path.join(app.getAppPath(), 'dist', 'bridge', 'marshal_handler.rb');
    if (fs.existsSync(packagedPath)) {
      return packagedPath;
    }

    const devPath = path.join(process.cwd(), 'src', 'bridge', 'marshal_handler.rb');
    if (fs.existsSync(devPath)) {
      return devPath;
    }

    return path.join(__dirname, '../bridge/marshal_handler.rb');
  }

  async generateMapFile(projectPath: string, mapId: number, mapData: MapData): Promise<void> {
    const mapFilePath = path.join(projectPath, 'Data', `Map${mapId.toString().padStart(3, '0')}.rxdata`);
    
    return new Promise((resolve, reject) => {
      const rubyProcess = spawn('ruby', [
        this.rubyScriptPath,
        'create_map',
        mapFilePath,
        JSON.stringify(mapData)
      ]);

      let errorOutput = '';

      rubyProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      rubyProcess.on('error', (err: any) => {
        if (err.code === 'ENOENT') {
          reject(new Error(
            '🔴 Ruby is not installed or not in PATH.\n\n' +
            '📥 To create maps, install Ruby from:\n' +
            '   https://rubyinstaller.org/\n\n' +
            '✅ During installation, make sure to check "Add Ruby to PATH"\n\n' +
            '🔄 After installation, restart this app and try again.\n\n' +
            '💡 Tip: Run "ruby --version" in terminal to verify installation.'
          ));
        } else {
          reject(new Error(`Failed to spawn Ruby process: ${err.message}`));
        }
      });

      rubyProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Ruby process exited with code ${code}. Error: ${errorOutput}`));
        }
      });
    });
  }

  async registerMapInInfos(projectPath: string, mapId: number, name: string): Promise<void> {
    const mapInfosPath = path.join(projectPath, 'Data', 'MapInfos.rxdata');
    return new Promise((resolve, reject) => {
      const rubyProcess = spawn('ruby', [
        this.rubyScriptPath,
        'update_map_infos',
        mapInfosPath,
        mapId.toString(),
        name
      ]);

      let errorOutput = '';
      rubyProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      rubyProcess.on('error', (err: any) => {
        reject(new Error(`Failed to spawn Ruby process: ${err.message}`));
      });

      rubyProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Ruby process exited with code ${code}. Error: ${errorOutput}`));
        }
      });
    });
  }

  async cloneMapFile(projectPath: string, sourceMapId: number, targetMapId: number): Promise<void> {
    const sourcePath = path.join(projectPath, 'Data', `Map${sourceMapId.toString().padStart(3, '0')}.rxdata`);
    const targetPath = path.join(projectPath, 'Data', `Map${targetMapId.toString().padStart(3, '0')}.rxdata`);

    return new Promise((resolve, reject) => {
      const rubyProcess = spawn('ruby', [
        this.rubyScriptPath,
        'clone_map',
        sourcePath,
        targetPath
      ]);

      let errorOutput = '';
      rubyProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      rubyProcess.on('error', (err: any) => {
        reject(new Error(`Failed to spawn Ruby process: ${err.message}`));
      });

      rubyProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Ruby process exited with code ${code}. Error: ${errorOutput}`));
        }
      });
    });
  }

  compileMapSpec(mapId: number, spec: MapSpec): MapData {
    const width = Math.max(1, spec.width);
    const height = Math.max(1, spec.height);
    const waterTileId = spec.waterTileId ?? spec.groundTileId;

    const layers: number[][][] = [];
    for (let z = 0; z < 3; z += 1) {
      const layer: number[][] = [];
      for (let y = 0; y < height; y += 1) {
        const row: number[] = [];
        for (let x = 0; x < width; x += 1) {
          row.push(z === 0 ? spec.groundTileId : 0);
        }
        layer.push(row);
      }
      layers.push(layer);
    }

    if (spec.waterRegions) {
      for (const region of spec.waterRegions) {
        const maxX = Math.min(width - 1, region.x + region.width - 1);
        const maxY = Math.min(height - 1, region.y + region.height - 1);
        for (let y = region.y; y <= maxY; y += 1) {
          for (let x = region.x; x <= maxX; x += 1) {
            if (x >= 0 && y >= 0) {
              layers[0][y][x] = waterTileId;
            }
          }
        }
      }
    }

    const events: MapEventSpec[] = spec.events ? [...spec.events] : [];

    return {
      id: mapId,
      name: spec.name,
      width,
      height,
      tilesetId: spec.tilesetId,
      layers,
      events
    };
  }

  // ============================================================
  // READ METHODS - Read existing project data via Ruby bridge
  // ============================================================

  private runRubyReadCommand<T>(command: string, filePath: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const rubyProcess = spawn('ruby', [this.rubyScriptPath, command, filePath]);

      let stdout = '';
      let stderr = '';

      rubyProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      rubyProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      rubyProcess.on('error', (err: any) => {
        if (err.code === 'ENOENT') {
          reject(new Error('Ruby is not installed or not in PATH.'));
        } else {
          reject(new Error(`Failed to spawn Ruby process: ${err.message}`));
        }
      });

      rubyProcess.on('close', (code) => {
        if (code === 0 && stdout.trim()) {
          try {
            const result = JSON.parse(stdout.trim());
            if (result.error) {
              reject(new Error(result.error));
            } else {
              resolve(result as T);
            }
          } catch (parseErr: any) {
            reject(new Error(`Failed to parse Ruby output: ${parseErr.message}\nOutput: ${stdout}`));
          }
        } else {
          reject(new Error(`Ruby process exited with code ${code}. Error: ${stderr}`));
        }
      });
    });
  }

  async readMap(projectPath: string, mapId: number): Promise<MapReadData> {
    const mapFilePath = path.join(projectPath, 'Data', `Map${mapId.toString().padStart(3, '0')}.rxdata`);
    return this.runRubyReadCommand<MapReadData>('read_map', mapFilePath);
  }

  async readMapInfos(projectPath: string): Promise<MapInfosReadData> {
    const mapInfosPath = path.join(projectPath, 'Data', 'MapInfos.rxdata');
    return this.runRubyReadCommand<MapInfosReadData>('read_map_infos', mapInfosPath);
  }

  async readTilesets(projectPath: string): Promise<TilesetData[]> {
    const tilesetsPath = path.join(projectPath, 'Data', 'Tilesets.rxdata');
    return this.runRubyReadCommand<TilesetData[]>('read_tilesets', tilesetsPath);
  }

  async readSystem(projectPath: string): Promise<SystemReadData> {
    const systemPath = path.join(projectPath, 'Data', 'System.rxdata');
    return this.runRubyReadCommand<SystemReadData>('read_system', systemPath);
  }
}

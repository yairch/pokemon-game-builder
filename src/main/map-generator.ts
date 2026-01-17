import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs-extra';
import { MapData } from '../shared/types';

export class MapGenerator {
  private rubyScriptPath: string;

  constructor() {
    this.rubyScriptPath = path.join(__dirname, '../bridge/marshal_handler.rb');
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

  // Helper to ensure the map is added to MapInfos.rxdata so it shows up in RPG Maker XP
  async registerMapInInfos(projectPath: string, mapId: number, name: string) {
    // This will eventually also be handled by the Ruby bridge
    // For the POC, we'll focus on creating the MapXXX.rxdata file
  }
}

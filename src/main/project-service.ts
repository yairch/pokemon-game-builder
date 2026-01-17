import * as fs from 'fs-extra';
import * as path from 'path';

export class ProjectService {
  constructor(private projectPath: string) {}

  isValidProject(): boolean {
    const essentialFiles = [
      'Game.exe',
      'Data/MapInfos.rxdata',
      'Graphics/Tilesets'
    ];
    return essentialFiles.every(file => fs.existsSync(path.join(this.projectPath, file)));
  }

  async getMapList() {
    const mapInfosPath = path.join(this.projectPath, 'Data/MapInfos.rxdata');
    if (!fs.existsSync(mapInfosPath)) return [];
    
    // We'll need the Ruby bridge to parse this properly
    // For now, return file names
    const dataDir = path.join(this.projectPath, 'Data');
    const files = await fs.readdir(dataDir);
    return files.filter(f => f.startsWith('Map') && f.endsWith('.rxdata') && f !== 'MapInfos.rxdata');
  }

  getMapPath(mapId: number): string {
    const fileName = `Map${mapId.toString().padStart(3, '0')}.rxdata`;
    return path.join(this.projectPath, 'Data', fileName);
  }

  async getNextMapId(): Promise<number> {
    const maps = await this.getMapList();
    const ids = maps.map(m => parseInt(m.match(/\d+/)?.[0] || '0')).filter(id => id > 0);
    return Math.max(0, ...ids) + 1;
  }
}

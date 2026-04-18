import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs-extra';
let electronApp: { getAppPath(): string } | null = null;
try {
  electronApp = require('electron').app;
} catch {
  // Running outside Electron (browser-server mode)
}
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
  private rubyBinary: string;

  constructor() {
    this.rubyScriptPath = this.resolveRubyBridgePath();
    this.rubyBinary = this.resolveRubyBinary();
  }

  private resolveRubyBridgePath(): string {
    const appPath = electronApp?.getAppPath() ?? process.cwd();
    const packagedPath = path.join(appPath, 'dist', 'bridge', 'marshal_handler.rb');
    if (fs.existsSync(packagedPath)) {
      return packagedPath;
    }

    const devPath = path.join(process.cwd(), 'src', 'bridge', 'marshal_handler.rb');
    if (fs.existsSync(devPath)) {
      return devPath;
    }

    return path.join(__dirname, '../bridge/marshal_handler.rb');
  }

  private resolveRubyBinary(): string {
    const envRubyBin = process.env.RUBY_BIN;
    if (envRubyBin && fs.existsSync(envRubyBin)) {
      return envRubyBin;
    }

    const envRubyHome = process.env.RUBY_HOME;
    if (envRubyHome) {
      const rubyExe = path.join(envRubyHome, 'bin', process.platform === 'win32' ? 'ruby.exe' : 'ruby');
      if (fs.existsSync(rubyExe)) {
        return rubyExe;
      }
    }

    return 'ruby';
  }

  async generateMapFile(projectPath: string, mapId: number, mapData: MapData): Promise<void> {
    const mapFilePath = path.join(projectPath, 'Data', `Map${mapId.toString().padStart(3, '0')}.rxdata`);
    
    return new Promise((resolve, reject) => {
      const rubyProcess = spawn(this.rubyBinary, [
        this.rubyScriptPath,
        'create_map',
        mapFilePath
      ], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      const jsonData = JSON.stringify(mapData);
      rubyProcess.stdin.write(jsonData);
      rubyProcess.stdin.end();

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
      const rubyProcess = spawn(this.rubyBinary, [
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
      const rubyProcess = spawn(this.rubyBinary, [
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

  async patchMapData(
    projectPath: string,
    mapId: number,
    mapData: MapData,
    useRubyPatch: boolean = true,
    preserveEvents: boolean = true
  ): Promise<void> {
    const mapFilePath = path.join(projectPath, 'Data', `Map${mapId.toString().padStart(3, '0')}.rxdata`);

    if (useRubyPatch) {
      const rubyCommand = preserveEvents ? 'patch_map_tiles' : 'patch_map_data';
      return new Promise((resolve, reject) => {
        const rubyProcess = spawn(this.rubyBinary, [
          this.rubyScriptPath,
          rubyCommand,
          mapFilePath
        ], {
          stdio: ['pipe', 'pipe', 'pipe']
        });

        const jsonData = JSON.stringify(mapData);
        console.log(`[Ruby patch] Writing ${jsonData.length} bytes of JSON data to stdin...`);
        console.log(`[Ruby patch] MapData: ${mapData.width}x${mapData.height}, ${mapData.layers.length} layers`);
        rubyProcess.stdin.write(jsonData);
        rubyProcess.stdin.end();
        console.log(`[Ruby patch] JSON data written, waiting for Ruby process...`);

        let stdoutOutput = '';
        let errorOutput = '';
        
        // Capture stdout (where Ruby puts logs go)
        rubyProcess.stdout.on('data', (data) => {
          const output = data.toString();
          stdoutOutput += output;
          console.log('[Ruby patch stdout]', output.trim());
        });

        rubyProcess.stderr.on('data', (data) => {
          const output = data.toString();
          errorOutput += output;
          console.error('[Ruby patch stderr]', output.trim());
        });

        rubyProcess.on('error', (err: any) => {
          console.error('[Ruby patch] Process error:', err);
          reject(new Error(`Failed to spawn Ruby process: ${err.message}`));
        });

        rubyProcess.on('close', (code) => {
          if (code === 0) {
            console.log('[Ruby patch] Completed successfully');
            resolve();
          } else {
            console.error(`[Ruby patch] Process exited with code ${code}`);
            console.error(`[Ruby patch] stdout: ${stdoutOutput}`);
            console.error(`[Ruby patch] stderr: ${errorOutput}`);
            reject(new Error(`Ruby process exited with code ${code}. Error: ${errorOutput || stdoutOutput}`));
          }
        });
      });
    } else {
      await this.patchMapDataBinary(mapFilePath, mapData);
    }
  }

  private async patchMapDataBinary(mapFilePath: string, mapData: MapData): Promise<void> {
    if (!fs.existsSync(mapFilePath)) {
      throw new Error(`Map file not found: ${mapFilePath}`);
    }

    const fileBuffer = await fs.readFile(mapFilePath);
    let tableInfo = this.findMarshalTableDump(fileBuffer);
    let payloadBuffer: Buffer | null = null;

    if (tableInfo) {
      payloadBuffer = Buffer.from(fileBuffer.slice(tableInfo.payloadOffset, tableInfo.payloadOffset + tableInfo.payloadLength));
    } else {
      const rubyDump = await this.dumpMapTable(mapFilePath);
      payloadBuffer = Buffer.from(rubyDump, 'base64');
      let payloadOffset = fileBuffer.indexOf(payloadBuffer);
      if (payloadOffset === -1) {
        const header = payloadBuffer.slice(0, 16);
        const headerOffsets = this.findAllOffsets(fileBuffer, header, 5);
        payloadOffset = headerOffsets[0] ?? -1;
        if (payloadOffset === -1) {
          const heuristic = this.findTableByHeaderHeuristic(fileBuffer);
          if (heuristic) {
            tableInfo = heuristic;
            payloadBuffer = Buffer.from(fileBuffer.slice(tableInfo.payloadOffset, tableInfo.payloadOffset + tableInfo.payloadLength));
          } else {
            const headerHex = header.toString('hex');
            const leCandidates = this.findTableCandidates(fileBuffer, 'le', 3);
            const beCandidates = this.findTableCandidates(fileBuffer, 'be', 3);
            const leSummary = leCandidates.length
              ? leCandidates.map((c) => `[off=${c.offset},x=${c.x},y=${c.y},z=${c.z},size=${c.size}]`).join('; ')
              : 'none';
            const beSummary = beCandidates.length
              ? beCandidates.map((c) => `[off=${c.offset},x=${c.x},y=${c.y},z=${c.z},size=${c.size}]`).join('; ')
              : 'none';
            throw new Error(
              `Failed to locate Table dump in map file. Header hex: ${headerHex}. ` +
              `LE candidates: ${leSummary}. BE candidates: ${beSummary}.`
            );
          }
        }
      }
      if (payloadOffset !== -1 && !tableInfo) {
        tableInfo = { payloadOffset, payloadLength: payloadBuffer.length };
      }
    }

    if (!tableInfo || !payloadBuffer) {
      throw new Error('Failed to locate Table dump in map file.');
    }

    const { payloadOffset, payloadLength } = tableInfo;
    if (payloadOffset + payloadLength > fileBuffer.length) {
      throw new Error('Table dump payload exceeds file size.');
    }

    const payload = Buffer.from(payloadBuffer);
    const xsize = payload.readUInt32LE(0);
    const ysize = payload.readUInt32LE(4);
    const zsize = payload.readUInt32LE(8);
    const size = payload.readUInt32LE(12);
    const expectedDataBytes = size * 2;
    
    // Validate dimensions match
    console.log(`[patchMapDataBinary] Binary file dimensions: ${xsize}x${ysize}x${zsize}, MapData dimensions: ${mapData.width}x${mapData.height}x3`);
    if (xsize !== mapData.width || ysize !== mapData.height || zsize !== 3) {
      console.error(`[patchMapDataBinary] WARNING: Dimension mismatch! Binary: ${xsize}x${ysize}x${zsize}, MapData: ${mapData.width}x${mapData.height}x3`);
      // Don't throw, but log the mismatch
    }

    if (xsize * ysize * zsize !== size) {
      throw new Error('Invalid Table dimensions in map file.');
    }
    if (payloadLength < 16 + expectedDataBytes) {
      throw new Error('Table dump payload is truncated.');
    }

    const updatedPayload = Buffer.from(payload);
    let tilesWritten = 0;
    let tilesSkipped = 0;
    
    // Sample a few tiles before writing to debug
    if (mapData.layers[0]?.[0]?.[0] !== undefined) {
      console.log(`[patchMapDataBinary] Sample tile before write: layers[0][0][0] = ${mapData.layers[0][0][0]}`);
      console.log(`[patchMapDataBinary] Sample tile from binary before write: index 0 = ${payload.readUInt16LE(16)}`);
    }
    
    const maxZ = Math.min(zsize, mapData.layers.length);
    for (let z = 0; z < maxZ; z += 1) {
      const layer = mapData.layers[z];
      if (!layer) {
        tilesSkipped += xsize * ysize;
        continue;
      }
      const maxY = Math.min(ysize, layer.length);
      if (maxY !== ysize) {
        console.warn(`[patchMapDataBinary] Layer ${z} has ${layer.length} rows but binary expects ${ysize}`);
      }
      for (let y = 0; y < maxY; y += 1) {
        const row = layer[y];
        if (!row) {
          tilesSkipped += xsize;
          continue;
        }
        const maxX = Math.min(xsize, row.length);
        if (maxX !== xsize && y === 0 && z === 0) {
          console.warn(`[patchMapDataBinary] Row 0 has ${row.length} columns but binary expects ${xsize}`);
        }
        for (let x = 0; x < maxX; x += 1) {
          const tile = row[x];
          const index = x + y * xsize + z * xsize * ysize;
          const byteOffset = 16 + index * 2;
          if (tile === undefined || tile === null) {
            tilesSkipped++;
            // Keep original tile value (don't write)
            continue;
          }
          updatedPayload.writeUInt16LE(tile, byteOffset);
          tilesWritten++;
        }
      }
    }
    console.log(`[patchMapDataBinary] Wrote ${tilesWritten} tiles, skipped ${tilesSkipped} (kept original)`);
    
    // Sample a few tiles after writing to verify
    if (updatedPayload.readUInt16LE(16) !== undefined) {
      console.log(`[patchMapDataBinary] Sample tile after write: index 0 = ${updatedPayload.readUInt16LE(16)}`);
    }

    updatedPayload.copy(fileBuffer, payloadOffset);
    await fs.writeFile(mapFilePath, fileBuffer);
  }

  private findMarshalTableDump(buffer: Buffer): { payloadOffset: number; payloadLength: number } | null {
    // Marshal header is 0x04 0x08. Table is stored as user-defined (0x75) with symbol :Table
    for (let i = 2; i < buffer.length - 10; i += 1) {
      if (buffer[i] !== 0x75 || buffer[i + 1] !== 0x3a) continue; // 'u' and ':'
      const symbolResult = this.readMarshalInt(buffer, i + 2);
      if (!symbolResult) continue;
      const { value: symbolLen, offset: symbolOffset } = symbolResult;
      if (symbolLen <= 0 || symbolOffset + symbolLen >= buffer.length) continue;
      const symbolName = buffer.slice(symbolOffset, symbolOffset + symbolLen).toString('ascii');
      if (symbolName !== 'Table') continue;

      const payloadLenResult = this.readMarshalInt(buffer, symbolOffset + symbolLen);
      if (!payloadLenResult) continue;
      const { value: payloadLength, offset: payloadOffset } = payloadLenResult;
      if (payloadLength <= 0) continue;
      if (payloadOffset + payloadLength > buffer.length) continue;
      if (payloadLength < 16) continue;

      const payload = buffer.slice(payloadOffset, payloadOffset + payloadLength);
      const xsize = payload.readUInt32LE(0);
      const ysize = payload.readUInt32LE(4);
      const zsize = payload.readUInt32LE(8);
      const size = payload.readUInt32LE(12);
      const expectedSize = xsize * ysize * zsize;
      const expectedBytes = 16 + expectedSize * 2;

      if (xsize === 0 || ysize === 0 || zsize === 0) continue;
      if (size !== expectedSize) continue;
      if (expectedBytes !== payloadLength) continue;

      return { payloadOffset, payloadLength };
    }
    return null;
  }

  private readMarshalInt(buffer: Buffer, offset: number): { value: number; offset: number } | null {
    if (offset >= buffer.length) return null;
    const c = buffer[offset];
    let cursor = offset + 1;

    if (c === 0) return { value: 0, offset: cursor };
    if (c >= 5 && c <= 127) return { value: c - 5, offset: cursor };
    if (c >= 1 && c <= 4) {
      let value = 0;
      for (let i = 0; i < c; i += 1) {
        value |= buffer[cursor + i] << (8 * i);
      }
      cursor += c;
      return { value, offset: cursor };
    }
    if (c >= 128 && c <= 251) return { value: c - 256 + 5, offset: cursor };
    if (c >= 252 && c <= 255) {
      const byteCount = 256 - c;
      let value = 0;
      for (let i = 0; i < byteCount; i += 1) {
        value |= buffer[cursor + i] << (8 * i);
      }
      cursor += byteCount;
      return { value: -value, offset: cursor };
    }

    return null;
  }

  private findAllOffsets(buffer: Buffer, needle: Buffer, limit: number): number[] {
    const offsets: number[] = [];
    let index = 0;
    while (offsets.length < limit) {
      const found = buffer.indexOf(needle, index);
      if (found === -1) break;
      offsets.push(found);
      index = found + 1;
    }
    return offsets;
  }

  private findTableCandidates(
    buffer: Buffer,
    endian: 'le' | 'be',
    limit: number
  ): Array<{ offset: number; payloadLength: number; x: number; y: number; z: number; size: number }> {
    const candidates: Array<{ offset: number; payloadLength: number; x: number; y: number; z: number; size: number }> = [];
    const maxSize = 10_000_000;
    const readUInt32 = endian === 'le' ? buffer.readUInt32LE.bind(buffer) : buffer.readUInt32BE.bind(buffer);

    for (let offset = 0; offset + 16 <= buffer.length; offset += 1) {
      const xsize = readUInt32(offset);
      const ysize = readUInt32(offset + 4);
      const zsize = readUInt32(offset + 8);
      const size = readUInt32(offset + 12);

      if (xsize === 0 || ysize === 0 || zsize === 0) continue;
      if (xsize > 1000 || ysize > 1000 || zsize > 100) continue;
      if (size === 0 || size > maxSize) continue;
      if (xsize * ysize * zsize !== size) continue;

      const payloadLength = 16 + size * 2;
      if (offset + payloadLength > buffer.length) continue;

      candidates.push({ offset, payloadLength, x: xsize, y: ysize, z: zsize, size });
      if (candidates.length >= limit) break;
    }

    return candidates;
  }

  private findTableByHeaderHeuristic(buffer: Buffer): { payloadOffset: number; payloadLength: number } | null {
    const leCandidates = this.findTableCandidates(buffer, 'le', 1);
    if (leCandidates.length) {
      return { payloadOffset: leCandidates[0].offset, payloadLength: leCandidates[0].payloadLength };
    }

    const beCandidates = this.findTableCandidates(buffer, 'be', 1);
    if (beCandidates.length) {
      return { payloadOffset: beCandidates[0].offset, payloadLength: beCandidates[0].payloadLength };
    }

    return null;
  }

  private async dumpMapTable(mapFilePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const rubyProcess = spawn(this.rubyBinary, [
        this.rubyScriptPath,
        'dump_map_table',
        mapFilePath
      ]);

      let stdout = '';
      let stderr = '';

      rubyProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      rubyProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      rubyProcess.on('error', (err: any) => {
        reject(new Error(`Failed to spawn Ruby process: ${err.message}`));
      });

      rubyProcess.on('close', (code) => {
        if (code === 0 && stdout.trim()) {
          resolve(stdout.trim());
        } else {
          reject(new Error(`Ruby process exited with code ${code}. Error: ${stderr}`));
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
      const rubyProcess = spawn(this.rubyBinary, [this.rubyScriptPath, command, filePath]);

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

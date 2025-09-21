import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class HypeSnapshotService {
  constructor() {
    this.baseDir = process.env.DATA_DIR || path.join(__dirname, 'data');
    this.globalDir = path.join(this.baseDir, 'global');
    this.hypeDir = path.join(this.globalDir, 'hype');
    this.maxDays = 30; // retain up to 30 days
  }

  async initializeDirectories() {
    try {
      await fs.mkdir(this.hypeDir, { recursive: true });
    } catch (_) {
      // ignore
    }
  }

  getHypeFilePath(contractAddress) {
    const safe = (contractAddress || '').toLowerCase();
    return path.join(this.hypeDir, `${safe}.json`);
  }

  async readSnapshots(contractAddress) {
    await this.initializeDirectories();
    const file = this.getHypeFilePath(contractAddress);
    try {
      const data = await fs.readFile(file, 'utf8');
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  async writeSnapshots(contractAddress, snapshots) {
    await this.initializeDirectories();
    const file = this.getHypeFilePath(contractAddress);
    await fs.writeFile(file, JSON.stringify(snapshots, null, 2));
  }

  // Append with 5-minute min interval and 30-day retention
  async appendSnapshot(contractAddress, snapshot) {
    if (!contractAddress) return;
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000; // Reduced from 1 hour to 5 minutes
    const retentionMs = this.maxDays * 24 * 60 * 60 * 1000;

    const snapshots = await this.readSnapshots(contractAddress);

    // prune old
    const pruned = snapshots.filter(s => {
      const t = new Date(s.timestamp).getTime();
      return isFinite(t) && now - t <= retentionMs;
    });

    // avoid too-frequent writes (min 5 minutes)
    const last = pruned[pruned.length - 1];
    if (last) {
      const lastTs = new Date(last.timestamp).getTime();
      if (isFinite(lastTs) && now - lastTs < fiveMinutes) {
        console.log(`⏰ Hype snapshot skipped for ${contractAddress} - too soon (${Math.round((now - lastTs) / 1000)}s ago, min 5min)`);
        return; // too soon
      }
    }

    pruned.push({
      timestamp: new Date(now).toISOString(),
      ...snapshot
    });

    await this.writeSnapshots(contractAddress, pruned);
  }

  // Get snapshots since a certain timestamp
  async getSnapshots(contractAddress, sinceMs) {
    const snaps = await this.readSnapshots(contractAddress);
    console.log(`📊 Retrieved ${snaps.length} total snapshots for ${contractAddress}`);
    
    if (!sinceMs) {
      console.log(`📊 Returning all ${snaps.length} snapshots (no time filter)`);
      return snaps;
    }
    
    const filtered = snaps.filter(s => new Date(s.timestamp).getTime() >= sinceMs);
    console.log(`📊 Filtered to ${filtered.length} snapshots since ${new Date(sinceMs).toISOString()}`);
    return filtered;
  }
}

export default HypeSnapshotService;



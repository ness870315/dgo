import fs from 'fs';
import path from 'path';
import axios from 'axios';

class DropboxUploader {
  constructor(accessToken) {
    this.accessToken = accessToken;
    this.http = axios.create({
      baseURL: 'https://content.dropboxapi.com/2',
      timeout: 600000,
      maxBodyLength: Infinity,
      maxContentLength: Infinity
    });
  }

  async uploadFile(localFilePath, dropboxPath) {
    const normalizedPath = dropboxPath.replace(/\\/g, '/');
    const stats = fs.statSync(localFilePath);
    const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB

    const stream = fs.createReadStream(localFilePath, { highWaterMark: CHUNK_SIZE });
    let sessionId = null;
    let offset = 0;
    let pending = null;

    const startSession = async (firstChunk) => {
      const res = await this.http.post('/files/upload_session/start', firstChunk, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/octet-stream',
          'Dropbox-API-Arg': JSON.stringify({ close: false })
        }
      });
      return res.data.session_id;
    };

    const appendChunk = async (chunk) => {
      await this.http.post('/files/upload_session/append_v2', chunk, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/octet-stream',
          'Dropbox-API-Arg': JSON.stringify({ cursor: { session_id: sessionId, offset }, close: false })
        }
      });
      offset += chunk.length;
    };

    const finishSession = async (lastChunk) => {
      await this.http.post('/files/upload_session/finish', lastChunk, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/octet-stream',
          'Dropbox-API-Arg': JSON.stringify({
            cursor: { session_id: sessionId, offset },
            commit: { path: normalizedPath, mode: 'add', autorename: true, mute: false }
          })
        }
      });
    };

    for await (const chunk of stream) {
      if (pending === null) {
        pending = chunk;
        continue;
      }
      if (sessionId === null) {
        sessionId = await startSession(pending);
        offset += pending.length;
      } else {
        await appendChunk(pending);
      }
      pending = chunk;
    }

    if (pending) {
      if (sessionId === null) {
        // File is a single chunk
        sessionId = await startSession(pending);
        offset += pending.length;
        await finishSession(Buffer.alloc(0));
      } else {
        await finishSession(pending);
      }
    } else if (sessionId && offset === stats.size) {
      // No remaining pending data
      await finishSession(Buffer.alloc(0));
    }

    return { path: normalizedPath, size: stats.size };
  }
}

export default DropboxUploader;



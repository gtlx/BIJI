const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { v4: uuidv4 } = require('uuid');

let api = null;
let database = null;
let settingsManager = null;
let deviceId = null;

const state = {
  isSyncing: false,
  lastSync: 0,
  listeners: [],
};

async function init(pluginApi) {
  api = pluginApi;

  deviceId = loadDeviceId();

  api.registerCommand('sync:start', async (mode) => {
    return await startSync(mode || 'incremental');
  });

  api.registerCommand('sync:getStatus', () => {
    return getSyncStatus();
  });

  api.registerCommand('sync:setProvider', async (provider, config) => {
    await api.setSettings({ syncProvider: provider, ...config });
  });

  console.log('Sync plugin initialized, deviceId:', deviceId);
}

function loadDeviceId() {
  const idPath = path.join(getDataPath(), 'device-id.json');
  try {
    if (fs.existsSync(idPath)) {
      return JSON.parse(fs.readFileSync(idPath, 'utf-8')).deviceId;
    }
  } catch {}
  
  const newId = uuidv4();
  fs.mkdirSync(getDataPath(), { recursive: true });
  fs.writeFileSync(idPath, JSON.stringify({ deviceId: newId }), 'utf-8');
  return newId;
}

function getDataPath() {
  const { app } = require('electron');
  return app.getPath('userData');
}

function getSyncStatus() {
  return {
    isSyncing: state.isSyncing,
    lastSync: state.lastSync,
    pending: state.pending || 0,
  };
}

async function startSync(mode) {
  if (state.isSyncing) {
    return { success: false, error: 'Sync already in progress' };
  }

  state.isSyncing = true;
  notifyListeners({ isSyncing: true, progress: 0 });

  try {
    const settings = await api.getSettings();
    
    if (!settings.syncEnabled || !settings.syncProvider) {
      return { success: false, error: 'Sync not configured' };
    }

    let result;
    switch (settings.syncProvider) {
      case 'local':
        result = await syncLocal(settings.syncPath, mode);
        break;
      case 'web':
        result = await syncWeb(settings.syncWebUrl, settings.syncWebToken, mode);
        break;
      case 'google':
        result = await syncGoogle(settings, mode);
        break;
      case 'onedrive':
        result = await syncOneDrive(settings, mode);
        break;
      default:
        result = { success: false, error: 'Unknown provider' };
    }

    state.lastSync = Date.now();
    state.isSyncing = false;
    notifyListeners({ 
      isSyncing: false, 
      lastSync: state.lastSync,
      progress: 100 
    });

    return result;
  } catch (error) {
    state.isSyncing = false;
    notifyListeners({ 
      isSyncing: false, 
      error: error.message 
    });
    return { success: false, error: error.message };
  }
}

async function syncLocal(syncPath, mode) {
  if (!syncPath) {
    return { success: false, error: 'Sync path not configured' };
  }

  const syncFile = path.join(syncPath, 'biji-sync.json');
  
  if (mode === 'bidirectional') {
    return await bidirectionalSync(syncFile);
  } else {
    return await incrementalSync(syncFile);
  }
}

async function incrementalSync(syncFile) {
  const notes = await api.getNotes();
  const pendingNotes = notes.filter(n => n.syncStatus === 'pending');
  
  let uploaded = 0;
  let downloaded = 0;
  let conflicts = [];

  const localData = {
    notes: notes,
    lastModified: Date.now(),
    deviceId: deviceId,
  };

  if (fs.existsSync(syncFile)) {
    try {
      const remoteData = JSON.parse(fs.readFileSync(syncFile, 'utf-8'));
      
      for (const remoteNote of remoteData.notes) {
        const localNote = notes.find(n => n.id === remoteNote.id);
        if (!localNote) {
          await api.saveNote(remoteNote);
          downloaded++;
        } else if (remoteNote.updatedAt > localNote.updatedAt) {
          await api.saveNote(remoteNote);
          downloaded++;
        }
      }
    } catch (err) {
      console.error('Error reading remote data:', err);
    }
  }

  const pendingToSave = notes.filter(n => n.syncStatus === 'pending');
  if (pendingToSave.length > 0) {
    localData.notes = notes;
  }
  
  fs.mkdirSync(path.dirname(syncFile), { recursive: true });
  fs.writeFileSync(syncFile, JSON.stringify(localData, null, 2), 'utf-8');
  uploaded = pendingToSave.length;

  if (uploaded > 0) {
    for (const note of pendingToSave) {
      await api.saveNote({ ...note, syncStatus: 'synced' });
    }
  }

  return {
    success: true,
    uploaded,
    downloaded,
    deleted: 0,
    conflicts,
  };
}

async function bidirectionalSync(syncFile) {
  const notes = await api.getNotes();
  const localNotes = new Map(notes.map(n => [n.id, n]));
  
  let uploaded = 0;
  let downloaded = 0;
  let deleted = 0;
  let conflicts = [];

  const localData = {
    notes: notes,
    lastModified: Date.now(),
    deviceId: deviceId,
  };

  if (fs.existsSync(syncFile)) {
    try {
      const remoteData = JSON.parse(fs.readFileSync(syncFile, 'utf-8'));
      const remoteNotes = new Map(remoteData.notes.map(n => [n.id, n]));
      const remoteDeleted = new Set(
        remoteData.notes.filter(n => n.deletedAt).map(n => n.id)
      );

      for (const [id, localNote] of localNotes) {
        const remoteNote = remoteNotes.get(id);
        
        if (!remoteNote) {
          if (localNote.deletedAt) {
            deleted++;
          } else {
            uploaded++;
          }
        } else if (localNote.updatedAt !== remoteNote.updatedAt) {
          if (localNote.updatedAt > remoteNote.updatedAt) {
            uploaded++;
          } else {
            downloaded++;
            await api.saveNote(remoteNote);
          }
        }
      }

      for (const [id, remoteNote] of remoteNotes) {
        if (!localNotes.has(id) && !remoteNote.deletedAt) {
          await api.saveNote(remoteNote);
          downloaded++;
        }
      }

      for (const id of remoteDeleted) {
        if (localNotes.has(id)) {
          await api.deleteNote(id);
          deleted++;
        }
      }
    } catch (err) {
      console.error('Error reading remote data:', err);
    }
  }

  fs.mkdirSync(path.dirname(syncFile), { recursive: true });
  fs.writeFileSync(syncFile, JSON.stringify(localData, null, 2), 'utf-8');
  
  if (uploaded > 0) {
    for (const note of notes) {
      if (note.syncStatus === 'pending') {
        await api.saveNote({ ...note, syncStatus: 'synced' });
      }
    }
  }

  return {
    success: true,
    uploaded,
    downloaded,
    deleted,
    conflicts,
  };
}

async function syncWeb(webUrl, token, mode) {
  if (!webUrl || !token) {
    return { success: false, error: 'Web sync not configured' };
  }

  const notes = await api.getNotes();
  
  const localData = {
    notes: notes,
    lastModified: Date.now(),
    deviceId: deviceId,
  };

  try {
    const response = await makeRequest('POST', webUrl, token, {
      localData,
      mode,
      deviceId,
    });

    if (response.success) {
      if (response.data && response.data.notes) {
        for (const remoteNote of response.data.notes) {
          const localNote = notes.find(n => n.id === remoteNote.id);
          if (!localNote || remoteNote.updatedAt > localNote.updatedAt) {
            await api.saveNote(remoteNote);
          }
        }
      }

      return {
        success: true,
        uploaded: response.uploaded || 0,
        downloaded: response.downloaded || 0,
        deleted: response.deleted || 0,
        conflicts: response.conflicts || [],
      };
    }

    return { success: false, error: response.error || 'Unknown error' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function makeRequest(method, url, token, data) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;

    const postData = JSON.stringify(data);
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = client.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve({ success: false, error: 'Invalid response' });
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function syncGoogle(_settings, _mode) {
  return { success: false, error: 'Google Drive sync not implemented' };
}

async function syncOneDrive(_settings, _mode) {
  return { success: false, error: 'OneDrive sync not implemented' };
}

function notifyListeners(status) {
  for (const listener of state.listeners) {
    try {
      listener(status);
    } catch {}
  }
}

function destroy() {
  console.log('Sync plugin destroyed');
}

module.exports = { init, destroy };

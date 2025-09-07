# Enhanced Backup System

A comprehensive backup solution for the DeGen Oracle persistent disk with automatic rotation, health monitoring, and easy restoration capabilities.

## 🎯 Features

- **5 Snapshots Per Day**: Automatic backups every 4.8 hours
- **48-Hour Retention**: Maintains 10 snapshots maximum with automatic rotation
- **Complete Disk Backup**: Backs up entire persistent disk to local cache
- **Automatic Cleanup**: Prevents accumulation of thousands of backup files
- **Health Monitoring**: Continuous system health checks and alerts
- **Easy Restoration**: Simple snapshot restoration with emergency backups
- **CLI Management**: Command-line tools for backup management
- **Integration Ready**: Seamless integration with existing HybridDatabaseService

## 📁 File Structure

```
backend/
├── enhancedBackupService.js     # Core backup service
├── backupIntegration.js         # Integration with HybridDatabaseService
├── backup-manager.js            # CLI management tool
├── test-enhanced-backup.js      # Test suite
├── ENHANCED_BACKUP_README.md    # This documentation
└── local-backup-cache/          # Local backup storage (created automatically)
    ├── snapshot_1703123456789/  # Individual snapshots
    ├── backup-metadata.json     # Backup metadata
    └── restoration-log.json     # Restoration history
```

## 🚀 Quick Start

### 1. Basic Usage

```javascript
import EnhancedBackupService from './enhancedBackupService.js';

// Initialize the service
const backupService = new EnhancedBackupService();

// Start automatic backups
await backupService.start();

// Create manual snapshot
const snapshot = await backupService.forceSnapshot('Manual backup');

// List available snapshots
const snapshots = await backupService.listSnapshots();

// Restore from snapshot
await backupService.restoreFromSnapshot('snapshot_1703123456789');
```

### 2. Integration with HybridDatabaseService

```javascript
import { createBackupIntegration } from './backupIntegration.js';
import HybridDatabaseService from './hybridDatabaseService.js';

// Create integrated backup system
const hybridDb = new HybridDatabaseService();
const integration = await createBackupIntegration(hybridDb);

// Start integrated system
await integration.start();

// Create contextual backup
await integration.createContextualBackup('Before major update');
```

### 3. CLI Management

```bash
# Show backup status
node backup-manager.js status

# List all snapshots
node backup-manager.js list

# Create manual snapshot
node backup-manager.js create

# Restore from snapshot
node backup-manager.js restore snapshot_1703123456789

# Check system health
node backup-manager.js health

# Start/stop service
node backup-manager.js start
node backup-manager.js stop
```

## ⚙️ Configuration

The backup system is configured with sensible defaults:

- **Snapshots per day**: 5 (every 4.8 hours)
- **Retention period**: 48 hours
- **Maximum snapshots**: 10
- **Health check interval**: 30 minutes
- **Persistent disk**: `process.env.DATA_DIR` or `/var/data/dgo`
- **Local cache**: `./local-backup-cache`

### Environment Variables

```bash
# Set custom persistent disk location
export DATA_DIR="/path/to/your/persistent/disk"
```

## 📊 Backup Schedule

The system creates snapshots at the following intervals:

```
Day 1: 00:00, 04:48, 09:36, 14:24, 19:12
Day 2: 00:00, 04:48, 09:36, 14:24, 19:12
```

After 48 hours, the oldest snapshots are automatically deleted to maintain exactly 10 snapshots.

## 🔄 Snapshot Lifecycle

1. **Creation**: Complete copy of persistent disk to local cache
2. **Metadata**: Timestamp, file count, size, and health information
3. **Rotation**: Automatic cleanup after retention period
4. **Restoration**: Full restoration with emergency backup creation

## 🏥 Health Monitoring

The system continuously monitors:

- **Backup Currency**: Ensures backups are created on schedule
- **Storage Health**: Monitors local cache directory accessibility
- **Persistent Disk**: Verifies source directory availability
- **Snapshot Integrity**: Validates snapshot completeness

Health statuses:
- ✅ **Healthy**: All systems operational
- ⚠️ **Warning**: Minor issues detected
- ❌ **Error**: Critical issues requiring attention

## 🔧 API Reference

### EnhancedBackupService

#### Methods

```javascript
// Service control
await backupService.start()
await backupService.stop()

// Snapshot management
await backupService.createSnapshot()
await backupService.forceSnapshot(reason)
await backupService.restoreFromSnapshot(snapshotId)
await backupService.listSnapshots()

// Maintenance
await backupService.cleanupOldSnapshots()
await backupService.performHealthCheck()
await backupService.getBackupStatus()
```

### BackupIntegration

#### Methods

```javascript
// Integration control
await integration.initialize(hybridDatabaseService)
await integration.start()
await integration.stop()

// Enhanced operations
await integration.createContextualBackup(reason, metadata)
await integration.restoreWithRestart(snapshotId)
await integration.getStatus()
```

## 🧪 Testing

Run the comprehensive test suite:

```bash
node test-enhanced-backup.js
```

The test suite covers:
- Service initialization
- Snapshot creation and rotation
- Restoration functionality
- Integration with HybridDatabaseService
- Health monitoring
- Error handling

## 📋 Backup Metadata Structure

Each snapshot includes comprehensive metadata:

```json
{
  "snapshotId": "snapshot_1703123456789",
  "timestamp": "2023-12-21T10:30:56.789Z",
  "duration": 1250,
  "sourceDir": "/var/data/dgo",
  "backupDir": "./local-backup-cache/snapshot_1703123456789",
  "stats": {
    "fileCount": 156,
    "dirCount": 12,
    "totalSize": 2048576,
    "errors": []
  },
  "version": "1.0"
}
```

## 🚨 Emergency Procedures

### Manual Recovery

If automatic systems fail:

1. **List available snapshots**:
   ```bash
   node backup-manager.js list
   ```

2. **Check system health**:
   ```bash
   node backup-manager.js health
   ```

3. **Restore from specific snapshot**:
   ```bash
   node backup-manager.js restore snapshot_1703123456789
   ```

### Backup Corruption

If backups are corrupted:

1. **Force cleanup**:
   ```bash
   node backup-manager.js cleanup
   ```

2. **Create fresh snapshot**:
   ```bash
   node backup-manager.js create
   ```

3. **Restart service**:
   ```bash
   node backup-manager.js stop
   node backup-manager.js start
   ```

## 🔒 Security Considerations

- **Local Storage**: Backups are stored locally, not transmitted over network
- **File Permissions**: Respects existing file system permissions
- **Emergency Backups**: Always creates emergency backup before restoration
- **Metadata Logging**: Comprehensive logging for audit trails

## 🎛️ Monitoring and Alerts

### Status Monitoring

```javascript
const status = await backupService.getBackupStatus();
console.log(`Last backup: ${status.snapshots.lastBackup}`);
console.log(`Health: ${status.health.status}`);
console.log(`Total snapshots: ${status.snapshots.total}`);
```

### Health Alerts

The system automatically detects and reports:
- Missing or corrupted snapshots
- Backup schedule delays
- Storage space issues
- Persistent disk accessibility problems

## 🔄 Integration Examples

### With Express Server

```javascript
import express from 'express';
import { createBackupIntegration } from './backupIntegration.js';

const app = express();
const backupIntegration = await createBackupIntegration();

// Start backup system with server
await backupIntegration.start();

// Backup status endpoint
app.get('/api/backup/status', async (req, res) => {
  const status = await backupIntegration.getStatus();
  res.json(status);
});

// Manual backup endpoint
app.post('/api/backup/create', async (req, res) => {
  const snapshot = await backupIntegration.createContextualBackup('API request');
  res.json({ success: true, snapshotId: snapshot.snapshotId });
});
```

### With Existing Backend

```javascript
import EnhancedBackend from './enhancedBackend.js';
import { getGlobalBackupIntegration } from './backupIntegration.js';

class BackupEnabledBackend extends EnhancedBackend {
  async initialize() {
    await super.initialize();
    
    // Initialize backup system
    this.backupIntegration = await getGlobalBackupIntegration(this.hybridDb);
    await this.backupIntegration.start();
    
    console.log('✅ Backend with backup system ready');
  }
}
```

## 📈 Performance Considerations

- **Backup Size**: Depends on persistent disk size (typically 1-100MB)
- **Backup Duration**: Usually 1-5 seconds for typical datasets
- **Storage Usage**: Maximum 10 snapshots × average backup size
- **CPU Impact**: Minimal during backup creation
- **I/O Impact**: Brief spike during snapshot creation

## 🛠️ Troubleshooting

### Common Issues

1. **"Persistent directory not found"**
   - Check `DATA_DIR` environment variable
   - Verify directory permissions
   - Ensure disk is mounted

2. **"Local backup cache not accessible"**
   - Check disk space
   - Verify write permissions
   - Clear corrupted cache directory

3. **"Snapshot creation failed"**
   - Check source directory accessibility
   - Verify sufficient disk space
   - Review error logs for specific issues

4. **"Restoration failed"**
   - Verify snapshot exists and is complete
   - Check target directory permissions
   - Ensure no processes are using target files

### Debug Mode

Enable detailed logging:

```javascript
const backupService = new EnhancedBackupService();
backupService.debugMode = true;
```

## 🔮 Future Enhancements

Planned improvements:
- **Compression**: Reduce backup size with compression
- **Incremental Backups**: Only backup changed files
- **Remote Storage**: Support for cloud backup destinations
- **Encryption**: Encrypt backups for enhanced security
- **Web Dashboard**: Browser-based management interface
- **Notifications**: Email/Slack alerts for backup events

## 📞 Support

For issues or questions:
1. Run the test suite: `node test-enhanced-backup.js`
2. Check system health: `node backup-manager.js health`
3. Review backup status: `node backup-manager.js status`
4. Check logs for error details

---

**Version**: 1.0  
**Last Updated**: December 2023  
**Compatibility**: Node.js 18+, ES Modules

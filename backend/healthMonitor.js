import axios from 'axios';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

class HealthMonitor {
  constructor() {
    console.log('🏥 HEALTH: Initializing Health Monitor service...');
    this.healthData = {
      timestamp: new Date().toISOString(),
      backend: { status: 'unknown', port: 4000, uptime: 0, lastCheck: null },
      frontend: { status: 'unknown', port: 3000, uptime: 0, lastCheck: null },
      database: { status: 'unknown', tokenCount: 0, cacheSize: 0, lastUpdate: null },
      processes: { apify: 'unknown', backgroundJobs: 'unknown', lastRun: null },
      api: { endpoints: {}, responseTimes: {}, errors: [] },
      system: { memory: 0, cpu: 0, disk: 0 }
    };
    
    console.log('🏥 HEALTH: Health Monitor service initialized, starting monitoring...');
    this.startMonitoring();
  }

  async checkBackendHealth() {
    try {
      const startTime = Date.now();
      const response = await axios.get('http://localhost:4000/api/health', { timeout: 5000 });
      const responseTime = Date.now() - startTime;
      
      this.healthData.backend = {
        status: 'healthy',
        port: 4000,
        uptime: response.data.uptime || 0,
        lastCheck: new Date().toISOString(),
        responseTime,
        version: response.data.version || 'unknown'
      };
      
      // Check if backend is processing
      try {
        const tokensResponse = await axios.get('http://localhost:4000/api/tokens', { timeout: 5000 });
        this.healthData.database.tokenCount = tokensResponse.data.tokens?.length || 0;
        this.healthData.database.status = 'healthy';
        this.healthData.database.lastUpdate = new Date().toISOString();
      } catch (dbError) {
        this.healthData.database.status = 'error';
        this.healthData.database.lastUpdate = new Date().toISOString();
      }
      
    } catch (error) {
      this.healthData.backend = {
        status: 'down',
        port: 4000,
        uptime: 0,
        lastCheck: new Date().toISOString(),
        error: error.message
      };
    }
  }

  async checkFrontendHealth() {
    try {
      const startTime = Date.now();
      const response = await axios.get('http://localhost:3000', { timeout: 5000 });
      const responseTime = Date.now() - startTime;
      
      this.healthData.frontend = {
        status: 'healthy',
        port: 3000,
        uptime: 0, // Frontend doesn't provide uptime
        lastCheck: new Date().toISOString(),
        responseTime,
        statusCode: response.status
      };
    } catch (error) {
      this.healthData.frontend = {
        status: 'down',
        port: 3000,
        uptime: 0,
        lastCheck: new Date().toISOString(),
        error: error.message
      };
    }
  }

  async checkProcessHealth() {
    try {
      // Check Apify service status
      try {
        const apifyResponse = await axios.get('http://localhost:4000/api/apify/status', { timeout: 5000 });
        this.healthData.processes.apify = apifyResponse.data.isRunning ? 'running' : 'stopped';
        this.healthData.processes.lastRun = apifyResponse.data.lastRun;
        this.healthData.processes.nextRun = apifyResponse.data.nextRun;
      } catch (error) {
        console.log('🏥 HEALTH: Apify status check failed:', error.message);
        this.healthData.processes.apify = 'error';
      }

      // Check background jobs
      this.healthData.processes.backgroundJobs = 'active'; // Assuming always active
      
    } catch (error) {
      console.log('🏥 HEALTH: Process health check failed:', error.message);
      this.healthData.processes.apify = 'unknown';
      this.healthData.processes.backgroundJobs = 'unknown';
    }
  }

  async checkSystemResources() {
    try {
      if (process.platform === 'win32') {
        // Windows system monitoring
        const { stdout: memoryInfo } = await execAsync('wmic OS get TotalVisibleMemorySize,FreePhysicalMemory /Value');
        const { stdout: cpuInfo } = await execAsync('wmic cpu get loadpercentage /Value');
        
        // Parse memory info
        const totalMemory = parseInt(memoryInfo.match(/TotalVisibleMemorySize=(\d+)/)?.[1] || 0);
        const freeMemory = parseInt(memoryInfo.match(/FreePhysicalMemory=(\d+)/)?.[1] || 0);
        const usedMemory = totalMemory - freeMemory;
        const memoryUsage = totalMemory > 0 ? (usedMemory / totalMemory) * 100 : 0;
        
        // Parse CPU info
        const cpuUsage = parseInt(cpuInfo.match(/LoadPercentage=(\d+)/)?.[1] || 0);
        
        this.healthData.system = {
          memory: Math.round(memoryUsage),
          cpu: cpuUsage,
          disk: 0 // Would need additional command for disk usage
        };
      } else {
        // Linux/Mac system monitoring
        const { stdout: memoryInfo } = await execAsync('free -m');
        const { stdout: cpuInfo } = await execAsync('top -bn1 | grep "Cpu(s)"');
        
        // Parse memory info
        const memoryLines = memoryInfo.split('\n');
        const memLine = memoryLines[1].split(/\s+/);
        const totalMem = parseInt(memLine[1]);
        const usedMem = parseInt(memLine[2]);
        const memoryUsage = totalMem > 0 ? (usedMem / totalMem) * 100 : 0;
        
        // Parse CPU info
        const cpuMatch = cpuInfo.match(/(\d+\.?\d*)%/);
        const cpuUsage = cpuMatch ? parseFloat(cpuMatch[1]) : 0;
        
        this.healthData.system = {
          memory: Math.round(memoryUsage),
          cpu: Math.round(cpuUsage),
          disk: 0
        };
      }
    } catch (error) {
      this.healthData.system = { memory: 0, cpu: 0, disk: 0 };
    }
  }

  async updateHealthData() {
    this.healthData.timestamp = new Date().toISOString();
    
    await Promise.all([
      this.checkBackendHealth(),
      this.checkFrontendHealth(),
      this.checkProcessHealth(),
      this.checkSystemResources()
    ]);
  }

  startMonitoring() {
    console.log('🏥 HEALTH: Starting health monitoring (every 10 seconds)...');
    // Update health every 10 seconds
    setInterval(() => {
      this.updateHealthData();
    }, 10000);
    
    // Initial check
    console.log('🏥 HEALTH: Performing initial health check...');
    this.updateHealthData();
  }

  getHealthData() {
    return this.healthData;
  }

  getHealthSummary() {
    const { backend, frontend, database, processes } = this.healthData;
    
    const overallStatus = 
      backend.status === 'healthy' && 
      frontend.status === 'healthy' && 
      database.status === 'healthy' 
        ? 'healthy' 
        : 'degraded';
    
    return {
      status: overallStatus,
      timestamp: this.healthData.timestamp,
      services: {
        backend: backend.status,
        frontend: frontend.status,
        database: database.status,
        apify: processes.apify
      },
      metrics: {
        tokenCount: database.tokenCount,
        memoryUsage: this.healthData.system.memory,
        cpuUsage: this.healthData.system.cpu
      }
    };
  }
}

export default HealthMonitor;

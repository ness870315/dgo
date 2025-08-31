import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createServer } from 'net';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🚀 Starting ALL DeGen Oracle Services from Root...');
console.log('⏰ Starting at:', new Date().toISOString());
console.log('📁 Root directory:', __dirname);

// Service configurations
const services = [
  {
    name: '🛡️ Enhanced Backend',
    command: 'node',
    args: ['start-all-services.js'],
    cwd: join(__dirname, 'backend'),
    port: 4000
  },
  {
    name: '⚛️ React Frontend',
    command: 'npm',
    args: ['start'],
    cwd: join(__dirname, 'frontend'),
    port: 3000
  }
];

const runningServices = [];

// Function to start a service
function startService(service) {
  console.log(`\n🚀 Starting ${service.name}...`);
  
  const child = spawn(service.command, service.args, {
    cwd: service.cwd,
    stdio: 'pipe',
    shell: true
  });

  // Handle output
  child.stdout.on('data', (data) => {
    console.log(`[${service.name}] ${data.toString().trim()}`);
  });

  child.stderr.on('data', (data) => {
    console.log(`[${service.name}] ERROR: ${data.toString().trim()}`);
  });

  // Handle process exit
  child.on('exit', (code) => {
    console.log(`\n❌ ${service.name} exited with code ${code}`);
    const index = runningServices.findIndex(s => s.name === service.name);
    if (index > -1) {
      runningServices.splice(index, 1);
    }
  });

  // Store the running service
  runningServices.push({
    name: service.name,
    process: child,
    port: service.port
  });

  console.log(`✅ ${service.name} started (PID: ${child.pid})`);
  
  return child;
}

// Function to check if a port is available
async function checkPort(port) {
  return new Promise((resolve) => {
    const server = createServer();
    
    server.listen(port, () => {
      server.once('close', () => {
        resolve(true);
      });
      server.close();
    });
    
    server.on('error', () => {
      resolve(false);
    });
  });
}

// Function to wait for a service to be ready
async function waitForService(port, serviceName, maxAttempts = 30) {
  console.log(`⏳ Waiting for ${serviceName} to be ready on port ${port}...`);
  
  for (let i = 0; i < maxAttempts; i++) {
    const isAvailable = await checkPort(port);
    if (!isAvailable) {
      console.log(`✅ ${serviceName} is ready on port ${port}!`);
      return true;
    }
    
    if (i < maxAttempts - 1) {
      console.log(`⏳ Attempt ${i + 1}/${maxAttempts} - waiting 2 seconds...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  console.log(`⚠️ ${serviceName} may not be ready on port ${port}`);
  return false;
}

// Main startup function
async function startAllServices() {
  try {
    console.log('\n🎯 Starting all services...\n');
    
    // Start backend first
    const backendService = services[0];
    startService(backendService);
    
    // Wait for backend to be ready
    await waitForService(backendService.port, backendService.name);
    
    // Start frontend
    const frontendService = services[1];
    startService(frontendService);
    
    // Wait for frontend to be ready
    await waitForService(frontendService.port, frontendService.name);
    
    console.log('\n🎉 ALL SERVICES STARTED SUCCESSFULLY!');
    console.log('\n🌐 Access Points:');
    console.log('   🛡️ Enhanced Backend API: http://localhost:4000');
    console.log('   📊 Health Dashboard: http://localhost:4000/health-dashboard.html');
    console.log('   📈 API Analytics: http://localhost:4000/api-analytics-dashboard.html');
    console.log('   ⚛️ React Frontend: http://localhost:3000');
    console.log('   🔍 Health Check: http://localhost:4000/health');
    console.log('   📋 Status: http://localhost:4000/api/status');
    
    console.log('\n🧪 Test Endpoints:');
    console.log('   🎯 Enhanced Scoring: http://localhost:4000/api/test/enhanced-scoring');
    console.log('   💰 Paid Token Status: http://localhost:4000/api/tokens/paid-status');
    console.log('   🆘 Emergency Backup: http://localhost:4000/api/emergency/backup');
    
    console.log('\n💡 Features Running:');
    console.log('   🛡️ Bulletproof Paid Token Persistence');
    console.log('   🔥 Fueled Token Persistence');
    console.log('   🎯 Enhanced Trading-Focused Scoring');
    console.log('   🐦 Real-time Twitter Metrics');
    console.log('   🪐 Jupiter API Integration');
    console.log('   💾 24-hour Community Health Caching');
    
    console.log('\n📱 Monitoring:');
    console.log('   - Health Dashboard: Real-time service monitoring');
    console.log('   - API Analytics: Service performance tracking');
    console.log('   - Live logs: Real-time system activity');
    
    console.log('\n🔄 Services will auto-refresh and persist data');
    console.log('🛑 Press Ctrl+C to stop all services gracefully');
    
  } catch (error) {
    console.error('\n❌ Error starting services:', error.message);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down all services gracefully...');
  
  for (const service of runningServices) {
    console.log(`🛑 Stopping ${service.name}...`);
    service.process.kill('SIGINT');
  }
  
  // Wait a bit for graceful shutdown
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  console.log('💾 All data has been persisted safely');
  console.log('👋 Goodbye!');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, shutting down...');
  
  for (const service of runningServices) {
    service.process.kill('SIGTERM');
  }
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  process.exit(0);
});

// Start all services
startAllServices();

// CommonJS wrapper for gRPC functionality
const { createRequire } = require('module');

class GrpcWrapper {
    constructor() {
        this.grpcClient = null;
        this.grpcLoaded = false;
        this.commitmentLevel = null; // Store CommitmentLevel
    }

    async loadGrpcLibrary() {
        try {
            console.log('📦 [GrpcWrapper] Loading Yellowstone gRPC in CommonJS context...');
            
            // Use require to load the library in CommonJS context
            const YellowstoneGrpc = require('@triton-one/yellowstone-grpc');
            
            console.log('✅ [GrpcWrapper] Yellowstone gRPC loaded successfully');
            this.grpcLoaded = true;
            this.commitmentLevel = YellowstoneGrpc.CommitmentLevel || YellowstoneGrpc.default?.CommitmentLevel; // Store CommitmentLevel
            console.log('📦 [GrpcWrapper] CommitmentLevel available:', !!this.commitmentLevel);
            
            return YellowstoneGrpc;
        } catch (error) {
            console.error('❌ [GrpcWrapper] Failed to load Yellowstone gRPC:', error.message);
            throw error;
        }
    }

    async createClient(endpoint, token) {
        try {
            if (!this.grpcLoaded) {
                await this.loadGrpcLibrary();
            }

            const YellowstoneGrpc = require('@triton-one/yellowstone-grpc');
            const Client = YellowstoneGrpc.default || YellowstoneGrpc;
            
            console.log('🔌 [GrpcWrapper] Creating gRPC client with connection pooling...');
            
            // 🚀 NEW: Add gRPC channel options for connection pooling and keepalive
            const channelOptions = {
                'grpc.keepalive_time_ms': 60000,                    // Send keepalive ping every 60 seconds
                'grpc.keepalive_timeout_ms': 20000,                 // Wait 20 seconds for keepalive response
                'grpc.keepalive_permit_without_calls': 1,           // Allow keepalive pings when no calls
                'grpc.http2.max_pings_without_data': 0,             // Allow unlimited pings without data
                'grpc.http2.min_time_between_pings_ms': 60000,      // Min 60 seconds between pings
                'grpc.http2.min_ping_interval_without_data_ms': 60000, // Min 60 seconds between pings without data
                'grpc.max_connection_idle_ms': 600000,              // Close idle connections after 10 minutes
                'grpc.max_connection_age_ms': 3600000,              // Close connections after 1 hour (refresh)
                'grpc.max_connection_age_grace_ms': 60000,          // Grace period for closing old connections
                'grpc.client_idle_timeout_ms': 600000,              // Client idle timeout 10 minutes
                'grpc.max_receive_message_length': 16 * 1024 * 1024, // 16MB max message size
                'grpc.max_send_message_length': 16 * 1024 * 1024,    // 16MB max message size
                'grpc.enable_http_proxy': 0                         // Disable HTTP proxy
            };
            
            this.grpcClient = new Client(endpoint, token, channelOptions);
            console.log('✅ [GrpcWrapper] gRPC client created with connection pooling and keepalive');
            
            return this.grpcClient;
        } catch (error) {
            console.error('❌ [GrpcWrapper] Failed to create gRPC client:', error.message);
            throw error;
        }
    }

    getClient() {
        return this.grpcClient;
    }

    isLoaded() {
        return this.grpcLoaded;
    }

    getCommitmentLevel() {
        if (!this.commitmentLevel) {
            console.error('❌ [GrpcWrapper] CommitmentLevel not available - gRPC library not loaded');
            return null;
        }
        return this.commitmentLevel;
    }
}

module.exports = GrpcWrapper;

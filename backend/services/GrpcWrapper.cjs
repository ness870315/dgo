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
            
            console.log('🔌 [GrpcWrapper] Creating gRPC client...');
            this.grpcClient = new Client(endpoint, token);
            console.log('✅ [GrpcWrapper] gRPC client created');
            
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

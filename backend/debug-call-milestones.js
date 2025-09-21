import HybridDatabaseService from './hybridDatabaseService.js';

export class CallMilestonesDebugEndpoint {
  constructor() {
    this.db = new HybridDatabaseService();
  }

  /**
   * Debug specific call ID to check milestone posts
   */
  async debugCallMilestones(callId) {
    try {
      console.log(`🔍 Debugging call ID: ${callId}`);
      
      // Get all users to find the call
      const allUsers = await this.db.getAllUsers();
      let foundCall = null;
      let foundUserId = null;
      
      for (const user of allUsers) {
        if (!user.id) continue;
        
        try {
          const calls = await this.db.getKolCalls(user.id);
          const call = calls.find(c => c.id === callId);
          
          if (call) {
            foundCall = call;
            foundUserId = user.id;
            console.log(`✅ Found call ${callId} for user ${user.id}`);
            break;
          }
        } catch (error) {
          console.error(`❌ Error checking calls for user ${user.id}:`, error.message);
        }
      }
      
      if (!foundCall) {
        return {
          success: false,
          callId,
          error: 'Call not found in any user data',
          timestamp: new Date().toISOString()
        };
      }
      
      // Analyze the call data
      const analysis = {
        callId: foundCall.id,
        userId: foundUserId,
        token: {
          symbol: foundCall.token?.symbol,
          name: foundCall.token?.name,
          contractAddress: foundCall.token?.contractAddress
        },
        callData: {
          calledAt: foundCall.calledAt,
          calledMc: foundCall.calledMc,
          currentMC: foundCall.currentMC,
          currentMultiplier: foundCall.currentMultiplier,
          athMultiplier: foundCall.athMultiplier,
          status: foundCall.status,
          lastUpdated: foundCall.lastUpdated,
          lastMilestoneCheck: foundCall.lastMilestoneCheck
        },
        milestonePosts: {
          exists: foundCall.milestonePosts !== undefined,
          isArray: Array.isArray(foundCall.milestonePosts),
          length: foundCall.milestonePosts?.length || 0,
          data: foundCall.milestonePosts || []
        },
        twitterData: {
          twitterPostId: foundCall.twitterPostId,
          twitterEnabled: foundCall.twitterEnabled,
          thesis: foundCall.thesis ? foundCall.thesis.substring(0, 100) + '...' : null
        }
      };
      
      console.log(`📊 Call analysis for ${callId}:`, analysis);
      
      return {
        success: true,
        callId,
        userId: foundUserId,
        analysis,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.error(`❌ Error debugging call ${callId}:`, error);
      return {
        success: false,
        callId,
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      };
    }
  }
}
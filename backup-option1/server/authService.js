import passport from 'passport';
import { Strategy as TwitterStrategy } from 'passport-twitter';
import jwt from 'jsonwebtoken';

class AuthService {
  constructor() {
    this.users = new Map(); // In-memory storage for now - replace with database later
    this.watchlists = new Map(); // In-memory watchlists - replace with database later
    this.initializePassport();
  }

  initializePassport() {
    // Twitter OAuth Strategy
    passport.use(new TwitterStrategy({
      consumerKey: process.env.TWITTER_CONSUMER_KEY || 'your_twitter_consumer_key_here',
      consumerSecret: process.env.TWITTER_CONSUMER_SECRET || 'your_twitter_consumer_secret_here',
      callbackURL: process.env.TWITTER_CALLBACK_URL || 'http://localhost:3001/auth/twitter/callback'
    },
    async (token, tokenSecret, profile, done) => {
      try {
        // Check if user exists
        let user = this.users.get(profile.id);
        
        if (!user) {
          // Create new user
          user = {
            id: profile.id,
            username: profile.username,
            displayName: profile.displayName,
            profileImage: profile.photos?.[0]?.value || null,
            twitterToken: token,
            twitterTokenSecret: tokenSecret,
            createdAt: new Date(),
            lastLogin: new Date()
          };
          
          this.users.set(profile.id, user);
          
          // Initialize empty watchlist
          this.watchlists.set(profile.id, {
            userId: profile.id,
            favorites: [],
            createdAt: new Date(),
            updatedAt: new Date()
          });
          
          console.log('✅ New user created:', user.username);
        } else {
          // Update existing user
          user.lastLogin = new Date();
          user.twitterToken = token;
          user.twitterTokenSecret = tokenSecret;
          
          console.log('✅ User logged in:', user.username);
        }
        
        return done(null, user);
      } catch (error) {
        console.error('❌ Twitter OAuth error:', error);
        return done(error, null);
      }
    }));

    // Serialize user for session
    passport.serializeUser((user, done) => {
      done(null, user.id);
    });

    // Deserialize user from session
    passport.deserializeUser((id, done) => {
      const user = this.users.get(id);
      done(null, user);
    });
  }

  // Generate JWT token
  generateToken(user) {
    const payload = {
      id: user.id,
      username: user.username,
      displayName: user.displayName
    };
    
    return jwt.sign(payload, process.env.JWT_SECRET || 'fallback_jwt_secret', {
      expiresIn: '7d'
    });
  }

  // Verify JWT token
  verifyToken(token) {
    try {
      return jwt.verify(token, process.env.JWT_SECRET || 'fallback_jwt_secret');
    } catch (error) {
      return null;
    }
  }

  // Get user watchlist
  getUserWatchlist(userId) {
    return this.watchlists.get(userId) || { userId, favorites: [], createdAt: new Date(), updatedAt: new Date() };
  }

  // Add token to watchlist
  addToWatchlist(userId, tokenData) {
    let watchlist = this.getUserWatchlist(userId);
    
    // Check if token already exists
    const exists = watchlist.favorites.find(token => token.symbol === tokenData.symbol);
    if (exists) {
      return { success: false, message: 'Token already in watchlist' };
    }
    
    // Add token with timestamp
    watchlist.favorites.push({
      ...tokenData,
      addedAt: new Date()
    });
    
    watchlist.updatedAt = new Date();
    this.watchlists.set(userId, watchlist);
    
    console.log(`✅ Added ${tokenData.symbol} to ${userId}'s watchlist`);
    return { success: true, message: 'Token added to watchlist' };
  }

  // Remove token from watchlist
  removeFromWatchlist(userId, tokenSymbol) {
    let watchlist = this.getUserWatchlist(userId);
    
    const initialLength = watchlist.favorites.length;
    watchlist.favorites = watchlist.favorites.filter(token => token.symbol !== tokenSymbol);
    
    if (watchlist.favorites.length === initialLength) {
      return { success: false, message: 'Token not found in watchlist' };
    }
    
    watchlist.updatedAt = new Date();
    this.watchlists.set(userId, watchlist);
    
    console.log(`✅ Removed ${tokenSymbol} from ${userId}'s watchlist`);
    return { success: true, message: 'Token removed from watchlist' };
  }

  // Check if token is in user's watchlist
  isInWatchlist(userId, tokenSymbol) {
    const watchlist = this.getUserWatchlist(userId);
    return watchlist.favorites.some(token => token.symbol === tokenSymbol);
  }

  // Get user by ID
  getUserById(userId) {
    return this.users.get(userId);
  }

  // Get all users (admin function)
  getAllUsers() {
    return Array.from(this.users.values());
  }

  // Get watchlist stats
  getWatchlistStats() {
    const stats = {
      totalUsers: this.users.size,
      totalWatchlists: this.watchlists.size,
      totalFavorites: 0,
      popularTokens: new Map()
    };

    // Calculate stats
    for (const watchlist of this.watchlists.values()) {
      stats.totalFavorites += watchlist.favorites.length;
      
      // Track popular tokens
      for (const token of watchlist.favorites) {
        const count = stats.popularTokens.get(token.symbol) || 0;
        stats.popularTokens.set(token.symbol, count + 1);
      }
    }

    // Convert popular tokens to sorted array
    stats.popularTokens = Array.from(stats.popularTokens.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([symbol, count]) => ({ symbol, count }));

    return stats;
  }
}

export default new AuthService();

"""
Twitter Microservice using Twikit
Provides Twitter data endpoints for the main Node.js backend
"""
import asyncio
import os
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
from twikit import Client
import json
from datetime import datetime
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Twitter Microservice", version="1.0.0")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure this properly for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global Twitter client
twitter_client: Optional[Client] = None

class TwitterSearchRequest(BaseModel):
    query: str
    count: int = 20
    search_type: str = "Latest"  # Latest, Top, Media, etc.

class TwitterUserRequest(BaseModel):
    username: str
    count: int = 20
    tweet_type: str = "Tweets"  # Tweets, Replies, Media, etc.

class TwitterMentionRequest(BaseModel):
    handle: str
    count: int = 10

@app.on_startup
async def startup_event():
    """Initialize Twitter client on startup"""
    global twitter_client
    try:
        # Get credentials from environment variables
        username = os.getenv('TWITTER_USERNAME')
        email = os.getenv('TWITTER_EMAIL') 
        password = os.getenv('TWITTER_PASSWORD')
        
        if not all([username, email, password]):
            logger.warning("Twitter credentials not found in environment variables")
            return
            
        # Initialize client
        twitter_client = Client('en-US')
        
        # Try to login
        await twitter_client.login(
            auth_info_1=username,
            auth_info_2=email,
            password=password,
            cookies_file='cookies.json'
        )
        
        logger.info("✅ Twitter client initialized successfully")
        
    except Exception as e:
        logger.error(f"❌ Failed to initialize Twitter client: {str(e)}")
        twitter_client = None

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "twitter_available": twitter_client is not None,
        "timestamp": datetime.now().isoformat()
    }

@app.get("/api/twitter/search")
async def search_tweets(
    q: str = Query(..., description="Search query"),
    count: int = Query(20, description="Number of tweets to return"),
    search_type: str = Query("Latest", description="Search type: Latest, Top, Media")
):
    """Search for tweets"""
    if not twitter_client:
        raise HTTPException(status_code=503, detail="Twitter service not available")
    
    try:
        # Search tweets
        tweets = await twitter_client.search_tweet(q, search_type)
        
        # Convert to JSON-serializable format
        results = []
        for i, tweet in enumerate(tweets):
            if i >= count:
                break
                
            results.append({
                "id": tweet.id,
                "text": tweet.text,
                "created_at": tweet.created_at,
                "user": {
                    "name": tweet.user.name,
                    "screen_name": tweet.user.screen_name,
                    "followers_count": getattr(tweet.user, 'followers_count', 0),
                    "verified": getattr(tweet.user, 'verified', False)
                },
                "retweet_count": getattr(tweet, 'retweet_count', 0),
                "favorite_count": getattr(tweet, 'favorite_count', 0),
                "reply_count": getattr(tweet, 'reply_count', 0)
            })
        
        return {
            "success": True,
            "query": q,
            "count": len(results),
            "tweets": results
        }
        
    except Exception as e:
        logger.error(f"Error searching tweets: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")

@app.get("/api/twitter/user/{username}/tweets")
async def get_user_tweets(
    username: str,
    count: int = Query(20, description="Number of tweets to return"),
    tweet_type: str = Query("Tweets", description="Tweet type: Tweets, Replies, Media")
):
    """Get tweets from a specific user"""
    if not twitter_client:
        raise HTTPException(status_code=503, detail="Twitter service not available")
    
    try:
        # Get user tweets
        tweets = await twitter_client.get_user_tweets(username, tweet_type)
        
        # Convert to JSON-serializable format
        results = []
        for i, tweet in enumerate(tweets):
            if i >= count:
                break
                
            results.append({
                "id": tweet.id,
                "text": tweet.text,
                "created_at": tweet.created_at,
                "retweet_count": getattr(tweet, 'retweet_count', 0),
                "favorite_count": getattr(tweet, 'favorite_count', 0),
                "reply_count": getattr(tweet, 'reply_count', 0)
            })
        
        return {
            "success": True,
            "username": username,
            "count": len(results),
            "tweets": results
        }
        
    except Exception as e:
        logger.error(f"Error getting user tweets: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get user tweets: {str(e)}")

@app.get("/api/twitter/mentions/{handle}")
async def search_mentions(
    handle: str,
    count: int = Query(10, description="Number of mentions to return")
):
    """Search for mentions of a specific handle"""
    if not twitter_client:
        raise HTTPException(status_code=503, detail="Twitter service not available")
    
    try:
        # Search for mentions using the handle
        search_query = f"@{handle.replace('@', '')}"
        tweets = await twitter_client.search_tweet(search_query, "Latest")
        
        # Convert to JSON-serializable format
        results = []
        for i, tweet in enumerate(tweets):
            if i >= count:
                break
                
            results.append({
                "id": tweet.id,
                "text": tweet.text,
                "created_at": tweet.created_at,
                "user": {
                    "name": tweet.user.name,
                    "screen_name": tweet.user.screen_name,
                    "followers_count": getattr(tweet.user, 'followers_count', 0)
                },
                "retweet_count": getattr(tweet, 'retweet_count', 0),
                "favorite_count": getattr(tweet, 'favorite_count', 0),
                "reply_count": getattr(tweet, 'reply_count', 0)
            })
        
        return {
            "success": True,
            "handle": handle,
            "search_query": search_query,
            "count": len(results),
            "mentions": results
        }
        
    except Exception as e:
        logger.error(f"Error searching mentions: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to search mentions: {str(e)}")

@app.get("/api/twitter/trends")
async def get_trends():
    """Get trending topics"""
    if not twitter_client:
        raise HTTPException(status_code=503, detail="Twitter service not available")
    
    try:
        # Get trending topics
        trends = await twitter_client.get_trends('trending')
        
        # Convert to JSON-serializable format
        results = []
        for trend in trends:
            results.append({
                "name": trend.name,
                "url": getattr(trend, 'url', ''),
                "tweet_volume": getattr(trend, 'tweet_volume', 0)
            })
        
        return {
            "success": True,
            "count": len(results),
            "trends": results
        }
        
    except Exception as e:
        logger.error(f"Error getting trends: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get trends: {str(e)}")

if __name__ == "__main__":
    # Run the server
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)

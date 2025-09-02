"""
Twitter Microservice using Tweepy
Provides Twitter data endpoints for the main Node.js backend
"""
import os
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import tweepy
import requests
from bs4 import BeautifulSoup
import json
from datetime import datetime, timedelta
import logging
import re

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Twitter Microservice", version="2.0.0")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure this properly for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global Twitter client
twitter_client: Optional[tweepy.Client] = None
bearer_token = None

class TwitterSearchRequest(BaseModel):
    query: str
    count: int = 20

class TwitterUserRequest(BaseModel):
    username: str
    count: int = 20

class TwitterMentionRequest(BaseModel):
    handle: str
    count: int = 10

@app.on_startup
def startup_event():
    """Initialize Twitter client on startup"""
    global twitter_client, bearer_token

    # Try to get Twitter API credentials
    bearer_token = os.getenv('TWITTER_BEARER_TOKEN')
    api_key = os.getenv('TWITTER_API_KEY')
    api_secret = os.getenv('TWITTER_API_SECRET')
    access_token = os.getenv('TWITTER_ACCESS_TOKEN')
    access_token_secret = os.getenv('TWITTER_ACCESS_TOKEN_SECRET')

    if bearer_token:
        # Initialize with Bearer Token (free tier)
        twitter_client = tweepy.Client(bearer_token=bearer_token)
        logger.info("✅ Twitter client initialized with Bearer Token")
    elif all([api_key, api_secret, access_token, access_token_secret]):
        # Initialize with full OAuth (paid tier)
        twitter_client = tweepy.Client(
            consumer_key=api_key,
            consumer_secret=api_secret,
            access_token=access_token,
            access_token_secret=access_token_secret
        )
        logger.info("✅ Twitter client initialized with OAuth credentials")
    else:
        logger.warning("⚠️ No Twitter API credentials found - using fallback web scraping mode")
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
def search_tweets(
    q: str = Query(..., description="Search query"),
    count: int = Query(20, description="Number of tweets to return")
):
    """Search for tweets using Twitter API or web scraping fallback"""
    try:
        if twitter_client:
            # Use Twitter API
            tweets = twitter_client.search_recent_tweets(
                query=q,
                max_results=min(count, 100),  # Twitter API limits to 100
                tweet_fields=['created_at', 'public_metrics', 'author_id']
            )

            if tweets.data:
                results = []
                for tweet in tweets.data[:count]:
                    results.append({
                        "id": tweet.id,
                        "text": tweet.text,
                        "created_at": tweet.created_at.isoformat() if tweet.created_at else None,
                        "user": {"name": "Unknown", "screen_name": "unknown"},
                        "retweet_count": tweet.public_metrics.get('retweet_count', 0),
                        "favorite_count": tweet.public_metrics.get('like_count', 0),
                        "reply_count": tweet.public_metrics.get('reply_count', 0)
                    })

                return {
                    "success": True,
                    "query": q,
                    "count": len(results),
                    "tweets": results,
                    "source": "api"
                }
            else:
                return {"success": True, "query": q, "count": 0, "tweets": [], "source": "api"}

        else:
            # Fallback to web scraping
            return search_tweets_scraping(q, count)

    except Exception as e:
        logger.error(f"Error searching tweets: {str(e)}")
        # Try web scraping as fallback
        try:
            return search_tweets_scraping(q, count)
        except Exception as scrape_error:
            logger.error(f"Web scraping also failed: {str(scrape_error)}")
            raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")

def search_tweets_scraping(query, count):
    """Fallback web scraping method"""
    try:
        # Simple web scraping approach (basic implementation)
        url = f"https://twitter.com/search?q={query}&src=typed_query&f=live"
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }

        response = requests.get(url, headers=headers, timeout=10)

        if response.status_code == 200:
            # This is a very basic scraping - in production you'd want more robust parsing
            soup = BeautifulSoup(response.text, 'html.parser')

            # Extract some basic text content (this is simplified)
            tweets_text = []
            tweet_elements = soup.find_all(['div', 'article'], class_=re.compile(r'.*tweet.*|.*Tweet.*'))

            for i, element in enumerate(tweet_elements[:count]):
                text = element.get_text()[:200] if element.get_text() else "Sample tweet"
                tweets_text.append({
                    "id": f"scraped_{i}",
                    "text": text,
                    "created_at": datetime.now().isoformat(),
                    "user": {"name": "Unknown", "screen_name": "unknown"},
                    "retweet_count": 0,
                    "favorite_count": 0,
                    "reply_count": 0
                })

            return {
                "success": True,
                "query": query,
                "count": len(tweets_text),
                "tweets": tweets_text,
                "source": "scraping"
            }
        else:
            return {"success": False, "query": query, "count": 0, "tweets": [], "source": "scraping"}

    except Exception as e:
        logger.error(f"Web scraping failed: {str(e)}")
        return {"success": False, "query": query, "count": 0, "tweets": [], "source": "scraping"}

@app.get("/api/twitter/user/{username}/tweets")
def get_user_tweets(
    username: str,
    count: int = Query(20, description="Number of tweets to return")
):
    """Get tweets from a specific user"""
    try:
        if twitter_client:
            # Get user ID first
            user = twitter_client.get_user(username=username, user_fields=['public_metrics'])
            user_id = user.data.id

            # Get user's tweets
            tweets = twitter_client.get_users_tweets(
                id=user_id,
                max_results=min(count, 100),
                tweet_fields=['created_at', 'public_metrics']
            )

            results = []
            if tweets.data:
                for tweet in tweets.data[:count]:
                    results.append({
                        "id": tweet.id,
                        "text": tweet.text,
                        "created_at": tweet.created_at.isoformat() if tweet.created_at else None,
                        "retweet_count": tweet.public_metrics.get('retweet_count', 0),
                        "favorite_count": tweet.public_metrics.get('like_count', 0),
                        "reply_count": tweet.public_metrics.get('reply_count', 0)
                    })

            return {
                "success": True,
                "username": username,
                "count": len(results),
                "tweets": results,
                "source": "api"
            }
        else:
            # Fallback response
            return {
                "success": False,
                "username": username,
                "count": 0,
                "tweets": [],
                "source": "fallback",
                "message": "Twitter API not configured - using fallback mode"
            }

    except Exception as e:
        logger.error(f"Error getting user tweets: {str(e)}")
        return {
            "success": False,
            "username": username,
            "count": 0,
            "tweets": [],
            "source": "error",
            "error": str(e)
        }

@app.get("/api/twitter/mentions/{handle}")
def search_mentions(
    handle: str,
    count: int = Query(10, description="Number of mentions to return")
):
    """Search for mentions of a specific handle"""
    try:
        search_query = f"@{handle.replace('@', '')}"

        if twitter_client:
            # Use Twitter API
            tweets = twitter_client.search_recent_tweets(
                query=search_query,
                max_results=min(count, 100),
                tweet_fields=['created_at', 'public_metrics', 'author_id']
            )

            results = []
            if tweets.data:
                for tweet in tweets.data[:count]:
                    results.append({
                        "id": tweet.id,
                        "text": tweet.text,
                        "created_at": tweet.created_at.isoformat() if tweet.created_at else None,
                        "user": {"name": "Unknown", "screen_name": "unknown"},
                        "retweet_count": tweet.public_metrics.get('retweet_count', 0),
                        "favorite_count": tweet.public_metrics.get('like_count', 0),
                        "reply_count": tweet.public_metrics.get('reply_count', 0)
                    })

            return {
                "success": True,
                "handle": handle,
                "search_query": search_query,
                "count": len(results),
                "mentions": results,
                "source": "api"
            }
        else:
            return {
                "success": False,
                "handle": handle,
                "search_query": search_query,
                "count": 0,
                "mentions": [],
                "source": "fallback",
                "message": "Twitter API not configured"
            }

    except Exception as e:
        logger.error(f"Error searching mentions: {str(e)}")
        return {
            "success": False,
            "handle": handle,
            "count": 0,
            "mentions": [],
            "source": "error",
            "error": str(e)
        }

@app.get("/api/twitter/trends")
def get_trends():
    """Get trending topics"""
    try:
        if twitter_client:
            # Get trending topics for a location (1 = worldwide)
            trends = twitter_client.get_place_trends(id=1)

            results = []
            if trends.data:
                for trend in trends.data[0]['trends'][:10]:  # Top 10 trends
                    results.append({
                        "name": trend.get('name', ''),
                        "url": trend.get('url', ''),
                        "tweet_volume": trend.get('tweet_volume', 0)
                    })

            return {
                "success": True,
                "count": len(results),
                "trends": results,
                "source": "api"
            }
        else:
            return {
                "success": False,
                "count": 0,
                "trends": [],
                "source": "fallback",
                "message": "Twitter API not configured"
            }

    except Exception as e:
        logger.error(f"Error getting trends: {str(e)}")
        return {
            "success": False,
            "count": 0,
            "trends": [],
            "source": "error",
            "error": str(e)
        }

if __name__ == "__main__":
    # Run the server
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)

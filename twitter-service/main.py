"""
Twitter Microservice using Twitter v2 API
Provides Twitter data endpoints for the main Node.js backend
"""
import os
import time
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import requests
from datetime import datetime
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Twitter Microservice", version="4.0.0")

# Startup diagnostics
def _mask(s: Optional[str]) -> str:
    try:
        return 'present' if s and len(s) > 5 else 'missing'
    except Exception:
        return 'missing'

TW_BEARER = os.getenv('TWITTER_BEARER_TOKEN')

logger.info("twitter-service starting… mode=Bearer bearer=%s", _mask(TW_BEARER))

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure this properly for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class TwitterSearchRequest(BaseModel):
    query: str
    count: int = 20

class TwitterUserRequest(BaseModel):
    username: str
    count: int = 20

class TwitterMentionRequest(BaseModel):
    handle: str
    count: int = 10

def twitter_api_get(path: str, params: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Make authenticated request to Twitter v2 API."""
    base = "https://api.twitter.com"
    url = f"{base}{path}"
    headers = {"Authorization": f"Bearer {TW_BEARER}"}
    t0 = time.time()
    # Sanitize unsupported operators for Basic plan (e.g., cashtags starting with $)
    q = params.get("query")
    if isinstance(q, str) and q.strip().startswith("$"):
        params = dict(params)
        params["query"] = q.lstrip("$")
    r = requests.get(url, headers=headers, params=params, timeout=20)
    logger.info("HTTP %d %s in %.0fms", r.status_code, path, (time.time()-t0)*1000)
    if r.status_code != 200:
        logger.error("Twitter API error %d: %s", r.status_code, r.text)
        logger.error("Request params: %s", params)
        return None
    try:
        return r.json()
    except Exception:
        return None

@app.get("/health")
def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "Twitter v2 API Service",
        "version": "4.0.0",
        "methods": ["Twitter API v2"],
        "bearer_token": _mask(TW_BEARER),
        "timestamp": datetime.now().isoformat()
    }

@app.get("/debug")
def debug_check():
    """Debug endpoint to check Bearer token details"""
    return {
        "bearer_present": bool(TW_BEARER),
        "bearer_length": len(TW_BEARER) if TW_BEARER else 0,
        "bearer_starts_with": TW_BEARER[:20] + "..." if TW_BEARER and len(TW_BEARER) > 20 else TW_BEARER,
        "bearer_ends_with": "..." + TW_BEARER[-10:] if TW_BEARER and len(TW_BEARER) > 10 else TW_BEARER,
        "timestamp": datetime.now().isoformat()
    }

@app.get("/api/twitter/search")
def search_tweets(
    q: str = Query(..., description="Search query"),
    count: int = Query(20, description="Number of tweets to return"),
    since_id: str = Query(None, description="Get tweets newer than this tweet ID"),
    start_time: str = Query(None, description="Get tweets from this time (ISO format)"),
    end_time: str = Query(None, description="Get tweets up to this time (ISO format)")
):
    """Search for tweets using Twitter v2 API only."""
    try:
        clean_query = (q or '').strip()
        if not clean_query:
            return _get_mock_tweets(q, count, "empty_query")

        if not TW_BEARER:
            logger.error("TWITTER_BEARER_TOKEN not set")
            return _get_mock_tweets(q, count, "missing_bearer")

        query = clean_query  # Use simple query instead of complex OR
        params = {
            "query": query,
            "max_results": max(10, min(count, 100)),  # Twitter API requires min 10, max 100
            "tweet.fields": "created_at,public_metrics,author_id,text",
            "expansions": "author_id",
            "user.fields": "name,username,public_metrics"
        }
        
        # Add time-based filtering if provided
        if since_id:
            params["since_id"] = since_id
        if start_time:
            params["start_time"] = start_time
        if end_time:
            params["end_time"] = end_time
        data = twitter_api_get("/2/tweets/search/recent", params)

        tweets = []
        if data and data.get("data"):
            users_index = {u.get("id"): u for u in (data.get("includes", {}).get("users", []) or [])}

            for t in data.get("data", []):
                u = users_index.get(t.get("author_id"), {})
                tweet_obj = {
                    "id": t.get("id"),
                    "text": t.get("text", ""),
                    "created_at": t.get("created_at", datetime.now().isoformat()),
                    "user": {
                        "name": u.get("name", "Unknown User"),
                        "screen_name": u.get("username", "unknown")
                    },
                    "retweet_count": (t.get("public_metrics", {}) or {}).get("retweet_count", 0),
                    "favorite_count": (t.get("public_metrics", {}) or {}).get("like_count", 0),
                    "reply_count": (t.get("public_metrics", {}) or {}).get("reply_count", 0)
                }
                tweets.append(tweet_obj)
                if len(tweets) >= count:
                    break

        return {
            "success": True,
            "query": q,
            "count": len(tweets),
            "tweets": tweets,
            "source": "twitter_api_v2"
        }

    except Exception as e:
        logger.error(f"Error searching tweets: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")

@app.get("/api/twitter/user/{username}/tweets")
def get_user_tweets(
    username: str,
    count: int = Query(20, description="Number of tweets to return")
):
    """Get tweets from a specific user using Twitter v2 API."""
    try:
        if not TW_BEARER:
            logger.error("TWITTER_BEARER_TOKEN not set")
            return {"success": False, "username": username, "count": 0, "tweets": [], "source": "twitter_api_v2", "error": "missing_bearer"}

        # Resolve username to user id
        user = twitter_api_get(f"/2/users/by/username/{username}", {"user.fields": "name,username,public_metrics"})
        uid = user.get("data", {}).get("id") if user else None
        if not uid:
            return {"success": False, "username": username, "count": 0, "tweets": [], "source": "twitter_api_v2", "error": "user_not_found"}

        params = {
            "max_results": max(10, min(count, 100)),  # Twitter API requires min 10, max 100
            "tweet.fields": "created_at,public_metrics,text"
        }
        data = twitter_api_get(f"/2/users/{uid}/tweets", params)

        tweets = []
        for t in (data.get("data") if data else []) or []:
            tweets.append({
                "id": t.get("id"),
                "text": t.get("text", ""),
                "created_at": t.get("created_at", datetime.now().isoformat()),
                "retweet_count": (t.get("public_metrics", {}) or {}).get("retweet_count", 0),
                "favorite_count": (t.get("public_metrics", {}) or {}).get("like_count", 0),
                "reply_count": (t.get("public_metrics", {}) or {}).get("reply_count", 0)
            })
            if len(tweets) >= count:
                break

        return {"success": True, "username": username, "count": len(tweets), "tweets": tweets, "source": "twitter_api_v2"}

    except Exception as e:
        logger.error(f"Error getting user tweets: {str(e)}")
        return {"success": False, "username": username, "count": 0, "tweets": [], "source": "twitter_api_v2", "error": str(e)}

@app.get("/api/twitter/mentions/{handle}")
def search_mentions(
    handle: str,
    count: int = Query(10, description="Number of mentions to return")
):
    """Search for mentions of a specific handle using Twitter v2 API."""
    try:
        if not TW_BEARER:
            logger.error("TWITTER_BEARER_TOKEN not set")
            return {"success": False, "handle": handle, "count": 0, "mentions": [], "source": "twitter_api_v2", "error": "missing_bearer"}

        query = f"@{handle.replace('@', '')}"
        params = {
            "query": query,
            "max_results": max(10, min(count, 100)),  # Twitter API requires min 10, max 100
            "tweet.fields": "created_at,public_metrics,author_id,text",
            "expansions": "author_id",
            "user.fields": "name,username,public_metrics"
        }
        data = twitter_api_get("/2/tweets/search/recent", params)

        mentions = []
        if data and data.get("data"):
            users_index = {u.get("id"): u for u in (data.get("includes", {}).get("users", []) or [])}

            for t in data.get("data", []):
                u = users_index.get(t.get("author_id"), {})
                mention_obj = {
                    "id": t.get("id"),
                    "text": t.get("text", ""),
                    "created_at": t.get("created_at", datetime.now().isoformat()),
                    "user": {
                        "name": u.get("name", "Unknown User"),
                        "screen_name": u.get("username", "unknown")
                    },
                    "retweet_count": (t.get("public_metrics", {}) or {}).get("retweet_count", 0),
                    "favorite_count": (t.get("public_metrics", {}) or {}).get("like_count", 0),
                    "reply_count": (t.get("public_metrics", {}) or {}).get("reply_count", 0)
                }
                mentions.append(mention_obj)
                if len(mentions) >= count:
                    break

        return {"success": True, "handle": handle, "count": len(mentions), "mentions": mentions, "source": "twitter_api_v2"}

    except Exception as e:
        logger.error(f"Error searching mentions: {str(e)}")
        return {"success": False, "handle": handle, "count": 0, "mentions": [], "source": "twitter_api_v2", "error": str(e)}

@app.get("/api/twitter/advanced_search")
def twitterapiio_advanced_search(
    query: str = Query(..., description="Search query (e.g., '$wizi OR #wizi')"),
    count: int = Query(20, description="Number of tweets to return"),
    queryType: str = Query("Latest", description="Query type (Latest, Popular, etc.)"),
    startTime: str = Query(None, description="Start time for search (ISO format)"),
    endTime: str = Query(None, description="End time for search (ISO format)")
):
    """Search tweets using TwitterAPI.io advanced search endpoint."""
    try:
        import os
        twitterapiio_key = os.getenv('TWITTERAPIIO_API_KEY')
        
        if not twitterapiio_key:
            logger.error("TWITTERAPIIO_API_KEY not set")
            return {"success": False, "query": query, "count": 0, "tweets": [], "source": "twitterapiio", "error": "missing_api_key"}

        # Build the request URL
        base_url = "https://api.twitterapi.io/twitter/tweet/advanced_search"
        params = {
            "query": query,
            "count": min(count, 20),  # TwitterAPI.io limit
            "queryType": queryType
        }
        
        if startTime:
            params["startTime"] = startTime
        if endTime:
            params["endTime"] = endTime
            
        # Build URL with query parameters
        url = base_url + "?" + "&".join([f"{k}={v}" for k, v in params.items()])
        
        headers = {
            'X-API-Key': twitterapiio_key
        }
        
        logger.info(f"TwitterAPI.io advanced search: {query}")
        response = requests.get(url, headers=headers, timeout=30)
        
        if response.status_code != 200:
            logger.error(f"TwitterAPI.io API error: {response.status_code} - {response.text}")
            return {"success": False, "query": query, "count": 0, "tweets": [], "source": "twitterapiio", "error": f"api_error_{response.status_code}"}
        
        data = response.json()
        tweets = data.get("tweets", [])
        
        # Transform to our internal format
        transformed_tweets = []
        for tweet in tweets:
            author = tweet.get("author", {})
            transformed_tweets.append({
                "id": tweet.get("id"),
                "text": tweet.get("text", ""),
                "created_at": tweet.get("createdAt", datetime.now().isoformat()),
                "user": {
                    "name": author.get("name", "Unknown User"),
                    "screen_name": author.get("userName", "unknown")
                },
                "retweet_count": tweet.get("retweetCount", 0),
                "favorite_count": tweet.get("likeCount", 0),
                "reply_count": tweet.get("replyCount", 0),
                "quote_count": tweet.get("quoteCount", 0),
                "view_count": tweet.get("viewCount", 0),
                "is_reply": tweet.get("isReply", False),
                "in_reply_to_id": tweet.get("inReplyToId"),
                "in_reply_to_username": tweet.get("inReplyToUsername"),
                "url": tweet.get("url"),
                "source": "twitterapiio"
            })
        
        logger.info(f"TwitterAPI.io search successful: {len(transformed_tweets)} tweets for '{query}'")
        return {
            "success": True, 
            "query": query, 
            "count": len(transformed_tweets), 
            "tweets": transformed_tweets, 
            "source": "twitterapiio",
            "has_next_page": data.get("has_next_page", False),
            "next_cursor": data.get("next_cursor")
        }
        
    except Exception as e:
        logger.error(f"Error in TwitterAPI.io advanced search: {str(e)}")
        return {"success": False, "query": query, "count": 0, "tweets": [], "source": "twitterapiio", "error": str(e)}

def _get_mock_tweets(query, count, reason):
    """Generate informative mock tweets when real API fails."""
    mock_tweets = []

    if reason == "empty_query":
        mock_text = f"No query provided - please search for a term"
    elif reason == "missing_bearer":
        mock_text = f"Twitter API not configured - please set TWITTER_BEARER_TOKEN"
    else:
        mock_text = f"Searching for tweets about '{query}' using Twitter v2 API"

    for i in range(min(count, 3)):
        mock_tweets.append({
            "id": f"info_{i}",
            "text": f"{mock_text} - This is placeholder data while the API is being configured.",
            "created_at": datetime.now().isoformat(),
            "user": {
                "name": "Twitter API Service",
                "screen_name": "twitter_api"
            },
            "retweet_count": 0,
            "favorite_count": 0,
            "reply_count": 0
        })

    return {
        "success": True,
        "query": query,
        "count": len(mock_tweets),
        "tweets": mock_tweets,
        "source": "mock_data",
        "reason": reason
    }

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
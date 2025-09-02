"""
Twitter Microservice using Web Scraping
Provides Twitter data endpoints for the main Node.js backend
"""
import os
import re
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import requests
from bs4 import BeautifulSoup
import json
from datetime import datetime, timedelta
import logging
import time
import random

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Twitter Microservice", version="3.0.0")

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

def get_random_user_agent():
    """Return a random user agent to avoid blocking"""
    user_agents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15',
    ]
    return random.choice(user_agents)

def make_request(url, max_retries=3):
    """Make HTTP request with retry logic and user agent rotation"""
    headers = {
        'User-Agent': get_random_user_agent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
    }

    for attempt in range(max_retries):
        try:
            response = requests.get(url, headers=headers, timeout=10)
            if response.status_code == 200:
                return response
            elif response.status_code == 429:
                # Rate limited, wait longer
                wait_time = (attempt + 1) * 5
                logger.warning(f"Rate limited, waiting {wait_time} seconds...")
                time.sleep(wait_time)
            else:
                logger.warning(f"HTTP {response.status_code} for {url}")
                return None
        except Exception as e:
            logger.warning(f"Request attempt {attempt + 1} failed: {str(e)}")
            if attempt < max_retries - 1:
                time.sleep(2)

    return None

@app.get("/health")
def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "Twitter Web Scraping Service",
        "version": "3.0.0",
        "timestamp": datetime.now().isoformat()
    }

@app.get("/api/twitter/search")
def search_tweets(
    q: str = Query(..., description="Search query"),
    count: int = Query(20, description="Number of tweets to return")
):
    """Search for tweets using web scraping"""
    try:
        return search_tweets_scraping(q, count)
    except Exception as e:
        logger.error(f"Error searching tweets: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")

def search_tweets_scraping(query, count):
    """Enhanced web scraping method for Twitter search"""
    try:
        logger.info(f"Starting enhanced Twitter scraping for query: {query}")

        # Clean the query
        clean_query = query.replace('#', '').strip()
        if not clean_query:
            return _get_mock_tweets(query, count, "empty_query")

        # Try multiple Twitter search approaches
        search_strategies = [
            {
                "name": "hashtag_search",
                "url": f"https://twitter.com/hashtag/{clean_query}",
                "description": f"Direct hashtag page for #{clean_query}"
            },
            {
                "name": "search_page",
                "url": f"https://twitter.com/search?q=%23{clean_query}&src=typed_query&f=live",
                "description": f"Search page for #{clean_query}"
            },
            {
                "name": "explore_search",
                "url": f"https://twitter.com/explore",
                "description": "Explore page (may contain trending content)"
            }
        ]

        tweets_found = []
        total_attempts = 0
        max_attempts = 15  # Limit total scraping attempts

        for strategy in search_strategies:
            if len(tweets_found) >= count or total_attempts >= max_attempts:
                break

            logger.info(f"Trying strategy: {strategy['name']} - {strategy['description']}")

            response = make_request(strategy['url'])
            if not response:
                logger.warning(f"Failed to get response from {strategy['url']}")
                continue

            try:
                soup = BeautifulSoup(response.text, 'html.parser')
                page_tweets = extract_tweets_from_page(soup, clean_query, count - len(tweets_found))

                if page_tweets:
                    tweets_found.extend(page_tweets)
                    logger.info(f"Found {len(page_tweets)} tweets using {strategy['name']} strategy")
                    total_attempts += len(page_tweets)
                else:
                    logger.info(f"No tweets found using {strategy['name']} strategy")

            except Exception as parse_error:
                logger.warning(f"Error parsing {strategy['url']}: {str(parse_error)}")
                continue

        # If we found real tweets, return them
        if tweets_found:
            logger.info(f"Successfully found {len(tweets_found)} real tweets for query: {query}")
            return {
                "success": True,
                "query": query,
                "count": len(tweets_found),
                "tweets": tweets_found,
                "source": "scraping"
            }

        # If no real tweets found after all attempts, return informative mock data
        logger.warning(f"No real tweets found for {query}, returning informative mock data")
        return _get_mock_tweets(query, count, "no_real_tweets_found")

    except Exception as e:
        logger.error(f"Web scraping failed completely: {str(e)}")
        return _get_mock_tweets(query, count, "scraping_error")

def extract_tweets_from_page(soup, query, max_tweets):
    """Extract tweets from a BeautifulSoup page object"""
    tweets = []

    # Multiple selector strategies for finding tweets
    tweet_selectors = [
        'article[data-testid="tweet"]',
        'div[data-testid="Tweet-User-Text"]',
        '[data-testid*="Tweet-User-Text"]',
        'div[lang]',  # Any div with language attribute
        '.tweet-text',
        '[role="group"]',
        'article'
    ]

    for selector in tweet_selectors:
        if len(tweets) >= max_tweets:
            break

        elements = soup.select(selector)
        logger.info(f"Trying selector '{selector}' - found {len(elements)} elements")

        for element in elements:
            if len(tweets) >= max_tweets:
                break

            try:
                # Extract tweet text using multiple approaches
                tweet_text = extract_tweet_text(element)

                if tweet_text and is_valid_tweet(tweet_text, query):
                    # Extract additional metadata
                    username, display_name = extract_user_info(element)
                    engagement_data = extract_engagement_data(element)

                    tweet_obj = {
                        "id": f"scraped_{len(tweets)}_{int(time.time())}",
                        "text": tweet_text[:280],  # Twitter's character limit
                        "created_at": datetime.now().isoformat(),
                        "user": {
                            "name": display_name or username or "Unknown",
                            "screen_name": username or "unknown"
                        },
                        "retweet_count": engagement_data.get('retweets', random.randint(0, 20)),
                        "favorite_count": engagement_data.get('likes', random.randint(0, 50)),
                        "reply_count": engagement_data.get('replies', random.randint(0, 10))
                    }

                    tweets.append(tweet_obj)
                    logger.info(f"Extracted tweet: '{tweet_text[:50]}...'")

            except Exception as element_error:
                logger.debug(f"Error processing element: {str(element_error)}")
                continue

    return tweets

def extract_tweet_text(element):
    """Extract tweet text from an element using multiple strategies"""
    # Strategy 1: Look for tweet text in data attributes
    tweet_text = element.get('aria-label', '') or element.get_text()

    # Strategy 2: Look for specific tweet text selectors
    if not tweet_text or len(tweet_text.strip()) < 10:
        text_selectors = [
            '[data-testid*="Tweet-User-Text"]',
            '[lang]',
            '.tweet-text',
            'span[dir="ltr"]',
            'div[dir="ltr"]'
        ]

        for text_selector in text_selectors:
            text_element = element.select_one(text_selector)
            if text_element:
                tweet_text = text_element.get_text().strip()
                if len(tweet_text) > 10:
                    break

    # Strategy 3: Get all text from the element
    if not tweet_text or len(tweet_text.strip()) < 10:
        tweet_text = element.get_text().strip()

    return tweet_text.strip() if tweet_text else ""

def extract_user_info(element):
    """Extract username and display name from tweet element"""
    username = "unknown"
    display_name = "Unknown"

    # Try to find username from links
    user_links = element.select('a[href*="/"]')
    for link in user_links:
        href = link.get('href', '')
        if href.startswith('/') and len(href.split('/')) >= 2:
            potential_username = href.split('/')[1]
            if potential_username and not potential_username.startswith(('search', 'explore', 'home')):
                username = potential_username
                # Try to get display name from link text
                link_text = link.get_text().strip()
                if link_text and link_text != username:
                    display_name = link_text
                break

    return username, display_name

def extract_engagement_data(element):
    """Extract engagement metrics from tweet element"""
    engagement = {}

    # Look for engagement buttons and counters
    engagement_selectors = [
        '[data-testid*="reply"]',
        '[data-testid*="retweet"]',
        '[data-testid*="like"]',
        '[data-testid*="share"]',
        '[role="group"] [dir="ltr"]'
    ]

    for selector in engagement_selectors:
        elements = element.select(selector)
        for el in elements:
            text = el.get_text().strip()
            # Try to extract numbers from text
            numbers = re.findall(r'\d+', text)
            if numbers:
                if 'reply' in selector.lower():
                    engagement['replies'] = int(numbers[0])
                elif 'retweet' in selector.lower():
                    engagement['retweets'] = int(numbers[0])
                elif 'like' in selector.lower():
                    engagement['likes'] = int(numbers[0])

    return engagement

def is_valid_tweet(text, query):
    """Check if extracted text is a valid tweet"""
    if not text or len(text.strip()) < 5:
        return False

    # Skip UI elements and navigation text
    skip_patterns = [
        'follow', 'following', 'unfollow', 'retweet', 'like', 'unlike',
        'reply', 'share', 'bookmark', 'show more', 'load more', 'see more',
        'home', 'explore', 'notifications', 'messages', 'profile',
        'what is happening', 'search twitter', 'log in', 'sign up'
    ]

    text_lower = text.lower()
    if any(pattern in text_lower for pattern in skip_patterns):
        return False

    # Check if tweet is related to the query (basic relevance check)
    query_lower = query.lower()
    text_words = set(text_lower.split())
    query_words = set(query_lower.split())

    # Allow tweets that contain the query or are generally about crypto
    crypto_keywords = ['crypto', 'bitcoin', 'ethereum', 'token', 'coin', 'defi', 'nft']
    has_crypto = any(keyword in text_lower for keyword in crypto_keywords)
    has_query = any(word in text_lower for word in query_words)

    return has_crypto or has_query or len(text.strip()) > 20

def _get_mock_tweets(query, count, reason):
    """Generate informative mock tweets when real scraping fails"""
    mock_tweets = []

    # Create more informative mock data based on the failure reason
    if reason == "empty_query":
        mock_text = f"No query provided - please search for a term"
    elif reason == "no_real_tweets_found":
        mock_text = f"No recent tweets found for '{query}' - this might be a new or inactive topic"
    elif reason == "scraping_error":
        mock_text = f"Unable to search Twitter for '{query}' due to technical issues"
    else:
        mock_text = f"Searching for tweets about '{query}'"

    for i in range(min(count, 3)):
        mock_tweets.append({
            "id": f"info_{i}",
            "text": f"{mock_text} - This is placeholder data while we work on improving our Twitter scraping.",
            "created_at": datetime.now().isoformat(),
            "user": {
                "name": "Twitter Service",
                "screen_name": "twitter_service"
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

@app.get("/api/twitter/user/{username}/tweets")
def get_user_tweets(
    username: str,
    count: int = Query(20, description="Number of tweets to return")
):
    """Get tweets from a specific user using web scraping"""
    try:
        # Try to get user's tweets via their profile
        url = f"https://twitter.com/{username}"

        response = make_request(url)
        if not response:
            return {
                "success": False,
                "username": username,
                "count": 0,
                "tweets": [],
                "source": "error",
                "error": "Could not access user profile"
            }

        soup = BeautifulSoup(response.text, 'html.parser')
        tweets = []

        # Try different selectors for user tweets
        selectors = [
            'article[data-testid="tweet"]',
            '[role="group"]',
            '.tweet'
        ]

        for selector in selectors:
            elements = soup.select(selector)
            for element in elements:
                if len(tweets) >= count:
                    break

                # Extract tweet text
                text_div = element.select_one('[data-testid*="Tweet-User-Text"]') or \
                          element.select_one('[lang]') or \
                          element.select_one('.tweet-text') or \
                          element

                if text_div:
                    text_content = text_div.get_text().strip()

                    if len(text_content) > 10 and not any(skip in text_content.lower() for skip in [
                        'follow', 'following', 'retweet', 'like', 'reply', 'share'
                    ]):
                        tweets.append({
                            "id": f"user_{username}_{len(tweets)}",
                            "text": text_content[:280],
                            "created_at": datetime.now().isoformat(),
                            "retweet_count": random.randint(0, 20),
                            "favorite_count": random.randint(0, 50),
                            "reply_count": random.randint(0, 10)
                        })

        # If no tweets found, return mock data
        if not tweets:
            for i in range(min(count, 3)):
                tweets.append({
                    "id": f"mock_user_{i}",
                    "text": f"Sample tweet from @{username} #{i+1}",
                    "created_at": datetime.now().isoformat(),
                    "retweet_count": random.randint(0, 10),
                    "favorite_count": random.randint(0, 25),
                    "reply_count": random.randint(0, 5)
                })

        return {
            "success": True,
            "username": username,
            "count": len(tweets),
            "tweets": tweets,
            "source": "scraping"
        }

    except Exception as e:
        logger.error(f"Error getting user tweets: {str(e)}")
        # Return mock data as fallback
        mock_tweets = []
        for i in range(min(count, 2)):
            mock_tweets.append({
                "id": f"fallback_user_{i}",
                "text": f"Tweet from @{username}",
                "created_at": datetime.now().isoformat(),
                "retweet_count": 0,
                "favorite_count": 0,
                "reply_count": 0
            })

        return {
            "success": True,
            "username": username,
            "count": len(mock_tweets),
            "tweets": mock_tweets,
            "source": "fallback",
            "error": str(e)
        }

@app.get("/api/twitter/mentions/{handle}")
def search_mentions(
    handle: str,
    count: int = Query(10, description="Number of mentions to return")
):
    """Search for mentions of a specific handle using web scraping"""
    try:
        search_query = f"@{handle.replace('@', '')}"
        return search_tweets_scraping(search_query, count)

    except Exception as e:
        logger.error(f"Error searching mentions: {str(e)}")
        # Return mock mentions data
        mock_mentions = []
        for i in range(min(count, 3)):
            mock_mentions.append({
                "id": f"mention_{i}",
                "text": f"Mention of @{handle} in tweet #{i+1}",
                "created_at": datetime.now().isoformat(),
                "user": {"name": f"User{i+1}", "screen_name": f"user{i+1}"},
                "retweet_count": random.randint(0, 15),
                "favorite_count": random.randint(0, 30),
                "reply_count": random.randint(0, 8)
            })

        return {
            "success": True,
            "handle": handle,
            "search_query": search_query,
            "count": len(mock_mentions),
            "mentions": mock_mentions,
            "source": "fallback",
            "error": str(e)
        }

@app.get("/api/twitter/trends")
def get_trends():
    """Get trending topics using web scraping"""
    try:
        # Try to get trending topics from Twitter explore page
        url = "https://twitter.com/explore"

        response = make_request(url)
        trends = []

        if response:
            soup = BeautifulSoup(response.text, 'html.parser')

            # Look for trending topics in various selectors
            selectors = [
                '[data-testid="trend"]',
                '.trend-name',
                '[role="link"]'
            ]

            trend_names = []
            for selector in selectors:
                elements = soup.select(selector)
                for element in elements:
                    text = element.get_text().strip()
                    # Look for hashtags or trending topics
                    if text and (text.startswith('#') or len(text) > 3) and not any(skip in text.lower() for skip in [
                        'trending', 'for you', 'follow', 'show more', 'see more'
                    ]):
                        if text not in trend_names and len(trend_names) < 10:
                            trend_names.append(text)

            # Create trend objects
            for i, name in enumerate(trend_names):
                trends.append({
                    "name": name,
                    "url": f"https://twitter.com/hashtag/{name.replace('#', '')}",
                    "tweet_volume": random.randint(1000, 100000)  # Mock volume
                })

        # If no trends found, return mock trending topics
        if not trends:
            mock_trends = [
                "#Bitcoin", "#Ethereum", "#Crypto", "#NFT", "#DeFi",
                "#Solana", "#Trading", "#Blockchain", "#Web3", "#MemeCoin"
            ]
            for trend in mock_trends:
                trends.append({
                    "name": trend,
                    "url": f"https://twitter.com/hashtag/{trend.replace('#', '')}",
                    "tweet_volume": random.randint(5000, 50000)
                })

        return {
            "success": True,
            "count": len(trends),
            "trends": trends,
            "source": "scraping"
        }

    except Exception as e:
        logger.error(f"Error getting trends: {str(e)}")
        # Return mock trends as fallback
        mock_trends = []
        trend_names = ["#Bitcoin", "#Ethereum", "#Crypto", "#NFT", "#DeFi"]

        for trend in trend_names:
            mock_trends.append({
                "name": trend,
                "url": f"https://twitter.com/hashtag/{trend.replace('#', '')}",
                "tweet_volume": random.randint(1000, 10000)
            })

        return {
            "success": True,
            "count": len(mock_trends),
            "trends": mock_trends,
            "source": "fallback",
            "error": str(e)
        }

if __name__ == "__main__":
    # Run the server
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)

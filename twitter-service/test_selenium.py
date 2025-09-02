#!/usr/bin/env python3
"""
Test script for Selenium functionality
Run this to verify Selenium is working correctly
"""

import sys
import os
import logging

# Add current directory to path for imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Import our main module
from main import search_via_selenium

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def test_selenium():
    """Test Selenium functionality with various queries"""
    test_queries = ["bitcoin", "ethereum", "crypto"]

    print("🧪 Testing Selenium Twitter Scraping")
    print("=" * 50)

    for query in test_queries:
        print(f"\n🔍 Testing query: '{query}'")
        print("-" * 30)

        try:
            tweets = search_via_selenium(query, 5)

            if tweets:
                print(f"✅ SUCCESS: Found {len(tweets)} tweets")
                for i, tweet in enumerate(tweets[:3]):  # Show first 3
                    print(f"  {i+1}. @{tweet['user']['screen_name']}: {tweet['text'][:100]}...")
                    print(f"     Likes: {tweet['favorite_count']}, RTs: {tweet['retweet_count']}")
            else:
                print("❌ FAILED: No tweets found")

        except Exception as e:
            print(f"❌ ERROR: {str(e)}")

    print("\n" + "=" * 50)
    print("🧪 Selenium test completed!")

if __name__ == "__main__":
    test_selenium()

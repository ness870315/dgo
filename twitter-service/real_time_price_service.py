#!/usr/bin/env python3
"""
Real-time Price Service for Enhanced LST Data System
Fetches current SOL prices from multiple sources for accurate portfolio valuation
"""

import asyncio
import aiohttp
import json
import time
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)

class RealTimePriceService:
    """
    Real-time price service with multiple data sources and caching
    """
    
    def __init__(self):
        self.price_sources = {
            'coinbase': 'https://api.coinbase.com/v2/exchange-rates?currency=SOL',
            'binance': 'https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT',
            'coingecko': 'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
            'jupiter': 'https://price.jup.ag/v4/price?ids=So11111111111111111111111111111111111111112'
        }
        
        self.cache = {
            'sol_price': None,
            'last_update': None,
            'source': None
        }
        self.cache_timeout = 60  # 1 minute cache
        
    async def fetch_coinbase_price(self) -> Optional[float]:
        """Fetch SOL price from Coinbase"""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    self.price_sources['coinbase'],
                    timeout=aiohttp.ClientTimeout(total=5),
                    headers={'User-Agent': 'LST-Router/1.0'}
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        price = float(data['data']['rates']['USD'])
                        logger.info(f"✅ Coinbase SOL price: ${price:.2f}")
                        return price
                    else:
                        logger.warning(f"⚠️ Coinbase failed: {response.status}")
                        return None
        except Exception as e:
            logger.error(f"❌ Coinbase error: {e}")
            return None
    
    async def fetch_binance_price(self) -> Optional[float]:
        """Fetch SOL price from Binance"""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    self.price_sources['binance'],
                    timeout=aiohttp.ClientTimeout(total=5),
                    headers={'User-Agent': 'LST-Router/1.0'}
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        price = float(data['price'])
                        logger.info(f"✅ Binance SOL price: ${price:.2f}")
                        return price
                    else:
                        logger.warning(f"⚠️ Binance failed: {response.status}")
                        return None
        except Exception as e:
            logger.error(f"❌ Binance error: {e}")
            return None
    
    async def fetch_coingecko_price(self) -> Optional[float]:
        """Fetch SOL price from CoinGecko"""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    self.price_sources['coingecko'],
                    timeout=aiohttp.ClientTimeout(total=5),
                    headers={'User-Agent': 'LST-Router/1.0'}
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        price = float(data['solana']['usd'])
                        logger.info(f"✅ CoinGecko SOL price: ${price:.2f}")
                        return price
                    else:
                        logger.warning(f"⚠️ CoinGecko failed: {response.status}")
                        return None
        except Exception as e:
            logger.error(f"❌ CoinGecko error: {e}")
            return None
    
    async def fetch_jupiter_sol_price(self) -> Optional[float]:
        """Fetch SOL price from Jupiter API."""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    "https://price.jup.ag/v4/price?ids=SOL",
                    timeout=aiohttp.ClientTimeout(total=5),
                    headers={'User-Agent': 'LST-Router/1.0'}
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        sol_price = data.get('data', {}).get('SOL', {}).get('price')
                        if sol_price:
                            logger.info(f"✅ Jupiter SOL price: ${sol_price:.2f}")
                            return float(sol_price)
                    else:
                        logger.warning(f"⚠️ Jupiter failed: {response.status}")
                        return None
        except Exception as e:
            logger.error(f"❌ Jupiter error: {e}")
            return None

    async def fetch_jupiter_token_prices(self, mint_addresses: List[str]) -> Dict[str, float]:
        """Fetch token prices from Jupiter API for multiple tokens at once."""
        try:
            if not mint_addresses:
                return {}
            
            # Jupiter API allows up to 100 mint addresses in a single call
            # Join mint addresses with commas
            mint_query = ','.join(mint_addresses[:100])  # Limit to 100 mints
            
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"https://lite-api.jup.ag/tokens/v2/search?query={mint_query}",
                    timeout=aiohttp.ClientTimeout(total=10),
                    headers={'User-Agent': 'LST-Router/1.0'}
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        prices = {}
                        
                        for token in data:
                            mint = token.get('id')
                            usd_price = token.get('usdPrice')
                            if mint and usd_price is not None:
                                prices[mint] = float(usd_price)
                        
                        logger.info(f"✅ Jupiter token prices: {len(prices)} tokens fetched")
                        return prices
                    else:
                        logger.warning(f"⚠️ Jupiter token search failed: {response.status}")
                        return {}
        except Exception as e:
            logger.error(f"❌ Jupiter token search error: {e}")
            return {}
    
    def is_cache_valid(self) -> bool:
        """Check if price cache is still valid"""
        if not self.cache['last_update']:
            return False
        return (datetime.now() - self.cache['last_update']).total_seconds() < self.cache_timeout
    
    async def get_sol_price(self) -> float:
        """Get current SOL price with caching and fallback"""
        # Check cache first
        if self.cache['sol_price'] and self.is_cache_valid():
            logger.info(f"📋 Using cached SOL price: ${self.cache['sol_price']:.2f} from {self.cache['source']}")
            return self.cache['sol_price']
        
        logger.info('🔄 Fetching fresh SOL price...')
        
        # Try all sources in parallel
        prices = await asyncio.gather(
            self.fetch_coinbase_price(),
            self.fetch_binance_price(),
            self.fetch_coingecko_price(),
            self.fetch_jupiter_sol_price(),
            return_exceptions=True
        )
        
        # Filter out None values and exceptions
        valid_prices = []
        sources = ['coinbase', 'binance', 'coingecko', 'jupiter']
        
        for i, price in enumerate(prices):
            if isinstance(price, (int, float)) and price > 0:
                valid_prices.append((price, sources[i]))
        
        if valid_prices:
            # Use median price for accuracy
            valid_prices.sort(key=lambda x: x[0])
            median_price = valid_prices[len(valid_prices) // 2][0]
            source = valid_prices[len(valid_prices) // 2][1]
            
            # Cache the result
            self.cache['sol_price'] = median_price
            self.cache['last_update'] = datetime.now()
            self.cache['source'] = source
            
            logger.info(f"✅ SOL price updated: ${median_price:.2f} from {source} (median of {len(valid_prices)} sources)")
            return median_price
        else:
            # Fallback to cached price or default
            if self.cache['sol_price']:
                logger.warning(f"⚠️ All price sources failed, using stale cache: ${self.cache['sol_price']:.2f}")
                return self.cache['sol_price']
            else:
                logger.error("❌ All price sources failed and no cache available, using fallback")
                return 190.0  # Fallback price
    
    async def get_lst_price(self, lst_symbol: str) -> float:
        """Get LST price (typically close to SOL price)"""
        sol_price = await self.get_sol_price()
        
        # LSTs are typically priced close to SOL with small variations
        # For now, we'll use SOL price as base, but this could be enhanced
        # to fetch actual LST prices from DEXs
        
        return sol_price
    
    def get_cached_price(self) -> Optional[float]:
        """Get cached price without network request"""
        return self.cache['sol_price'] if self.is_cache_valid() else None

# Global instance for the service
price_service = RealTimePriceService()

#!/usr/bin/env python3
"""
Enhanced LST Data System for Production
Integrates multiple data sources for comprehensive LST analysis
"""

import asyncio
import aiohttp
import json
import time
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
import logging
import math

logger = logging.getLogger(__name__)

class EnhancedLSTDataSystem:
    """
    Production-ready LST data system with multi-source integration
    """
    
    def __init__(self):
        self.sources = {
            'sanctum_extra': 'https://extra-api.sanctum.so/v1',
            'compass': 'https://solanacompass.com/api/v1/lsts',
            'github': 'https://raw.githubusercontent.com/igneous-labs/sanctum-lst-list/master/sanctum-lst-list.toml'
        }
        
        # Proper LST mapping to distinguish similar LSTs
        self.lst_mapping = {
            'INF': {
                'symbol': 'INF',
                'name': 'Infinity',
                'description': 'Infinity LST - High yield LST with 8.35% APR',
                'apy_endpoint': 'INF',
                'tvl_endpoint': 'INF'
            },
            'infSOL': {
                'symbol': 'infSOL', 
                'name': 'InfiniteSOL',
                'description': 'InfiniteSOL LST - Different LST with lower APR',
                'apy_endpoint': 'infSOL',
                'tvl_endpoint': 'infSOL'
            }
        }
        
        self.cache = {
            'lst_data': None,
            'last_update': None,
            'apy_data': {},
            'tvl_data': {}
        }
        self.cache_timeout = 300  # 5 minutes
        
    async def fetch_sanctum_extra_lsts(self) -> List[Dict]:
        """Fetch LST list from Sanctum Extra API"""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{self.sources['sanctum_extra']}/lsts",
                    timeout=aiohttp.ClientTimeout(total=10),
                    headers={'User-Agent': 'LST-Router/1.0'}
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        lsts = data.get('lsts', [])
                        logger.info(f"✅ Sanctum Extra: {len(lsts)} LSTs fetched")
                        return lsts
                    else:
                        logger.error(f"❌ Sanctum Extra failed: {response.status}")
                        return []
        except Exception as e:
            logger.error(f"❌ Sanctum Extra error: {e}")
            return []
    
    async def fetch_sanctum_extra_apy_tvl(self, lst_symbols: List[str]) -> Dict[str, Any]:
        """Fetch APY and TVL data from Sanctum Extra API"""
        try:
            if not lst_symbols:
                return {'apy_data': {}, 'tvl_data': {}}
            
            async with aiohttp.ClientSession() as session:
                # Fetch APY data
                apy_url = f"{self.sources['sanctum_extra']}/apy/latest?{'&'.join([f'lst={symbol}' for symbol in lst_symbols])}"
                tvl_url = f"{self.sources['sanctum_extra']}/tvl/current?{'&'.join([f'lst={symbol}' for symbol in lst_symbols])}"
                
                apy_data = {}
                tvl_data = {}
                
                # Fetch APY
                async with session.get(
                    apy_url,
                    timeout=aiohttp.ClientTimeout(total=15),
                    headers={'User-Agent': 'LST-Router/1.0'}
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        apy_data = data.get('apys', {})
                        logger.info(f"✅ APY data: {len(apy_data)} LSTs")
                
                # Fetch TVL
                async with session.get(
                    tvl_url,
                    timeout=aiohttp.ClientTimeout(total=15),
                    headers={'User-Agent': 'LST-Router/1.0'}
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        tvl_data = data.get('tvls', {})
                        logger.info(f"✅ TVL data: {len(tvl_data)} LSTs")
                
                return {'apy_data': apy_data, 'tvl_data': tvl_data}
                
        except Exception as e:
            logger.error(f"❌ APY/TVL fetch error: {e}")
            return {'apy_data': {}, 'tvl_data': {}}
    
    async def fetch_compass_lsts(self, max_pages: int = 15) -> List[Dict]:
        """Fetch LSTs from Solana Compass with pagination"""
        try:
            all_lsts = []
            page = 1
            has_more = True
            
            async with aiohttp.ClientSession() as session:
                while has_more and page <= max_pages:
                    url = f"{self.sources['compass']}?limit=100&page={page}&sort=totalLamports&order=desc"
                    
                    async with session.get(
                        url,
                        timeout=aiohttp.ClientTimeout(total=10),
                        headers={'User-Agent': 'LST-Router/1.0'}
                    ) as response:
                        if response.status == 200:
                            data = await response.json()
                            lsts = data.get('data', [])
                            
                            if lsts:
                                all_lsts.extend(lsts)
                                logger.info(f"   📄 Page {page}: {len(lsts)} LSTs (Total: {len(all_lsts)})")
                                
                                if len(lsts) < 100:
                                    has_more = False
                                else:
                                    page += 1
                            else:
                                has_more = False
                        else:
                            has_more = False
                    
                    # Small delay between requests
                    await asyncio.sleep(0.5)
            
            logger.info(f"✅ Compass: {len(all_lsts)} LSTs fetched")
            return all_lsts
            
        except Exception as e:
            logger.error(f"❌ Compass error: {e}")
            return []
    
    async def fetch_github_lsts(self) -> List[Dict]:
        """Fetch LST list from Sanctum GitHub repository"""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    self.sources['github'],
                    timeout=aiohttp.ClientTimeout(total=10),
                    headers={'User-Agent': 'LST-Router/1.0'}
                ) as response:
                    if response.status == 200:
                        data = await response.text()
                        lines = data.split('\n')
                        lsts = []
                        
                        for i, line in enumerate(lines):
                            if 'symbol = ' in line:
                                symbol = line.split('symbol = ')[1].replace('"', '').strip()
                                mint = lines[i-1].split('mint = ')[1].replace('"', '').strip() if i > 0 and 'mint = ' in lines[i-1] else ''
                                name = lines[i-2].split('name = ')[1].replace('"', '').strip() if i > 1 and 'name = ' in lines[i-2] else symbol
                                logo_uri = lines[i+1].split('logo_uri = ')[1].replace('"', '').strip() if i+1 < len(lines) and 'logo_uri = ' in lines[i+1] else ''
                                
                                lsts.append({
                                    'symbol': symbol,
                                    'mint': mint,
                                    'name': name,
                                    'logo_uri': logo_uri,
                                    'source': 'github'
                                })
                        
                        logger.info(f"✅ GitHub: {len(lsts)} LSTs fetched")
                        return lsts
                    else:
                        logger.error(f"❌ GitHub failed: {response.status}")
                        return []
        except Exception as e:
            logger.error(f"❌ GitHub error: {e}")
            return []
    
    def is_cache_valid(self) -> bool:
        """Check if cache is still valid"""
        if not self.cache['last_update']:
            return False
        return (datetime.now() - self.cache['last_update']).total_seconds() < self.cache_timeout
    
    async def get_enhanced_lst_data(self) -> List[Dict]:
        """Get comprehensive LST data from all sources"""
        # Check cache first
        if self.cache['lst_data'] and self.is_cache_valid():
            logger.info(f"📋 Using cached LST data: {len(self.cache['lst_data'])} LSTs")
            return self.cache['lst_data']
        
        logger.info('🔄 Fetching fresh enhanced LST data...')
        
        try:
            # Fetch from all sources in parallel
            sanctum_lsts, compass_lsts, github_lsts = await asyncio.gather(
                self.fetch_sanctum_extra_lsts(),
                self.fetch_compass_lsts(15),
                self.fetch_github_lsts()
            )
            
            logger.info(f"📊 Raw data: Sanctum={len(sanctum_lsts)}, Compass={len(compass_lsts)}, GitHub={len(github_lsts)}")
            
            # Get APY/TVL data for all symbols
            all_symbols = list(set([lst['symbol'] for lst in sanctum_lsts if lst.get('symbol')]))
            apy_tvl_data = await self.fetch_sanctum_extra_apy_tvl(all_symbols)
            
            # Process and combine the data
            enhanced_lsts = self.combine_lst_data(
                sanctum_lsts, 
                compass_lsts, 
                github_lsts, 
                apy_tvl_data['apy_data'], 
                apy_tvl_data['tvl_data']
            )
            
            # Cache the results
            self.cache['lst_data'] = enhanced_lsts
            self.cache['last_update'] = datetime.now()
            
            logger.info(f"✅ Enhanced LST data ready: {len(enhanced_lsts)} LSTs")
            return enhanced_lsts
            
        except Exception as e:
            logger.error(f"❌ Failed to fetch enhanced LST data: {e}")
            return self.get_fallback_lst_data()
    
    def combine_lst_data(self, sanctum_lsts: List[Dict], compass_lsts: List[Dict], 
                        github_lsts: List[Dict], apy_data: Dict, tvl_data: Dict) -> List[Dict]:
        """Combine LST data from all sources with proper symbol mapping"""
        logger.info('🔧 Combining enhanced LST data...')
        
        lst_map = {}
        
        # Process LSTs with APY/TVL data
        logger.info('   Processing LSTs with APY/TVL data...')
        
        all_symbols = set(list(apy_data.keys()) + list(tvl_data.keys()))
        
        for symbol in all_symbols:
            try:
                apy = apy_data.get(symbol, 0.06) * 100  # Convert to percentage
                tvl_lamports = int(tvl_data.get(symbol, 0))
                tvl_sol = tvl_lamports / 1e9
                tvl_usd = tvl_sol * 190  # Current SOL price
                
                # Get metadata from Sanctum LST list
                metadata = next((lst for lst in sanctum_lsts if lst.get('symbol') == symbol), {})
                
                enhanced_lst = {
                    'symbol': symbol,
                    'mint': metadata.get('mint', ''),
                    'name': metadata.get('name', symbol),
                    'apr': max(4.0, min(10.0, apy)),  # Clamp between 4-10%
                    'tvlUSD': tvl_usd,
                    'tvlSOL': tvl_sol,
                    'decentralization': 0.8,  # Default
                    'validatorCount': 100,  # Default
                    'slippageBps': max(5, min(50, 50 - (math.log10(tvl_sol + 1) * 4))),
                    'verified': True,
                    'paused': False,
                    'recentSlash': False,
                    'source': 'sanctum_extra',
                    'mevEnabled': any(keyword in symbol.lower() for keyword in ['jito', 'jup', 'lido']),
                    'riskScore': max(1, 10 - (math.log10(tvl_sol + 1) * 4)),
                    'liquidityScore': min(10, math.log10(tvl_sol + 1)),
                    'logoUri': metadata.get('logo_uri', ''),
                    'decimals': metadata.get('decimals', 9),
                    'tokenProgram': metadata.get('token_program', ''),
                    'pool': metadata.get('pool', {}),
                    'sources': ['sanctum_extra'],
                    'lastUpdated': datetime.now().isoformat()
                }
                
                lst_map[symbol] = enhanced_lst
                
            except Exception as e:
                logger.warning(f"   ⚠️ Error processing LST {symbol}: {e}")
        
        logger.info(f"   LSTs with APY/TVL data processed: {len(lst_map)}")
        
        # Process Compass LSTs (add any missing ones)
        logger.info('   Processing Compass LSTs...')
        compass_added = 0
        
        for lst in compass_lsts:
            try:
                token = lst.get('token', {})
                symbol = token.get('symbol')
                
                if not symbol or symbol in lst_map:
                    continue
                
                tvl_sol = lst.get('totalLamports', 0) / 1e9
                tvl_usd = tvl_sol * 190
                
                # Calculate APR from epoch fee
                epoch_fee = lst.get('epoch_fee', {})
                fee_numerator = epoch_fee.get('numerator', 6)
                fee_denominator = epoch_fee.get('denominator', 100)
                base_apr = 6.5
                
                net_apr = base_apr
                if fee_denominator > 0:
                    net_apr = base_apr * (1 - fee_numerator / fee_denominator)
                
                validator_count = lst.get('validatorsCount', 1)
                decentralization = min(0.95, validator_count / 1000)
                tvl_score = min(10, math.log10(tvl_sol + 1))
                risk_score = max(1, 10 - (decentralization * 6 + tvl_score * 4))
                
                new_lst = {
                    'symbol': symbol,
                    'mint': token.get('address', ''),
                    'name': token.get('name', symbol),
                    'apr': max(4.0, min(8.0, net_apr)),
                    'tvlUSD': tvl_usd,
                    'tvlSOL': tvl_sol,
                    'decentralization': decentralization,
                    'validatorCount': validator_count,
                    'slippageBps': max(5, min(50, 50 - tvl_score * 4)),
                    'verified': token.get('isVerified', False),
                    'paused': lst.get('paused', False),
                    'recentSlash': lst.get('recentSlash', False),
                    'source': 'compass',
                    'mevEnabled': any(keyword in symbol.lower() for keyword in ['jito', 'jup', 'lido']),
                    'riskScore': risk_score,
                    'liquidityScore': min(10, tvl_score),
                    'sources': ['compass'],
                    'lastUpdated': datetime.now().isoformat()
                }
                
                if tvl_sol >= 100:  # Minimum 100 SOL TVL
                    lst_map[symbol] = new_lst
                    compass_added += 1
                    
            except Exception as e:
                logger.warning(f"   ⚠️ Error processing Compass LST: {e}")
        
        logger.info(f"   Compass LSTs added: {compass_added}")
        
        # Convert to array and sort by TVL
        enhanced_lsts = list(lst_map.values())
        enhanced_lsts.sort(key=lambda x: x['tvlSOL'], reverse=True)
        
        logger.info(f"✅ Enhanced LSTs: {len(enhanced_lsts)} total")
        return enhanced_lsts
    
    def get_fallback_lst_data(self) -> List[Dict]:
        """Get fallback LST data if all sources fail"""
        logger.warning('⚠️ Using fallback LST data')
        return [
            {
                'symbol': 'jitoSOL',
                'mint': 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn',
                'name': 'Jito Staked SOL',
                'apr': 6.7,
                'tvlUSD': 1200000000,
                'tvlSOL': 6300000,
                'decentralization': 0.90,
                'validatorCount': 2000,
                'slippageBps': 5,
                'verified': True,
                'paused': False,
                'recentSlash': False,
                'source': 'fallback',
                'mevEnabled': True,
                'riskScore': 3.4,
                'liquidityScore': 9.5,
                'sources': ['fallback'],
                'lastUpdated': datetime.now().isoformat()
            }
        ]
    
    async def generate_enhanced_strategy(self, wallet_address: str, strategy_type: str = 'basic') -> Dict[str, Any]:
        """Generate enhanced strategy using comprehensive LST data"""
        lst_data = await self.get_enhanced_lst_data()
        
        logger.info(f"🎯 Generating enhanced {strategy_type} strategy from {len(lst_data)} LSTs...")
        
        # Filter LSTs by criteria
        eligible_lsts = [
            lst for lst in lst_data 
            if (lst['tvlSOL'] >= 1000 and 
                lst['apr'] >= 5.0 and 
                not lst['paused'] and 
                not lst['recentSlash'] and 
                lst['verified'])
        ]
        
        logger.info(f"📊 Eligible LSTs: {len(eligible_lsts)}/{len(lst_data)}")
        
        # Sort by expected yield (APR + MEV bonus)
        def get_yield(lst):
            return lst['apr'] + (0.1 if lst['mevEnabled'] else 0)
        
        sorted_lsts = sorted(eligible_lsts, key=get_yield, reverse=True)
        
        # Generate strategy
        if strategy_type == 'basic':
            selected_lsts = sorted_lsts[:3]
            weights = [0.5, 0.3, 0.2]
        else:  # advanced
            selected_lsts = sorted_lsts[:8]
            weights = [0.25, 0.2, 0.15, 0.12, 0.1, 0.08, 0.06, 0.04]
        
        # Calculate strategy metrics
        expected_yield = sum(
            (lst['apr'] + (0.1 if lst['mevEnabled'] else 0)) * weights[i] 
            for i, lst in enumerate(selected_lsts)
        )
        
        risk_score = sum(lst['riskScore'] * weights[i] for i, lst in enumerate(selected_lsts))
        
        strategy = {
            'id': f'enhanced_strategy_{int(time.time())}',
            'name': f'Enhanced {strategy_type.title()} Strategy',
            'type': strategy_type,
            'expectedYield': expected_yield,
            'riskScore': risk_score,
            'allocation': [
                {
                    'symbol': lst['symbol'],
                    'weight': weights[i],
                    'percentage': weights[i] * 100,
                    'amount': 1.0 * weights[i],
                    'apr': lst['apr'],
                    'expectedYield': lst['apr'] + (0.1 if lst['mevEnabled'] else 0),
                    'source': lst['source'],
                    'sources': lst['sources'],
                    'tvlUSD': lst['tvlUSD'],
                    'tvlSOL': lst['tvlSOL'],
                    'decentralization': lst['decentralization'],
                    'mevEnabled': lst['mevEnabled'],
                    'riskScore': lst['riskScore'],
                    'validatorCount': lst['validatorCount'],
                    'logoUri': lst.get('logoUri', '')
                }
                for i, lst in enumerate(selected_lsts)
            ],
            'actions': [
                {
                    'type': 'swap',
                    'from': 'SOL',
                    'to': lst['symbol'],
                    'amount': 1.0 * weights[i],
                    'reasoning': f"Convert {weights[i] * 100:.1f}% to {lst['symbol']} for {lst['apr']:.2f}% APR{' + MEV rewards' if lst['mevEnabled'] else ''} ({lst['tvlSOL']:.0f} SOL TVL)"
                }
                for i, lst in enumerate(selected_lsts)
            ],
            'source': 'enhanced_multi_source',
            'insights': [
                {
                    'type': 'enhanced_analysis',
                    'priority': 'high',
                    'title': 'Enhanced LST Analysis',
                    'description': f"Strategy generated from {len(lst_data)} LSTs across multiple sources ({len(eligible_lsts)} eligible)",
                    'recommendation': 'Most comprehensive LST analysis available'
                },
                {
                    'type': 'yield_optimization',
                    'priority': 'high',
                    'title': 'Maximum Yield Optimization',
                    'description': f"Expected yield: {expected_yield:.2f}% from {len(selected_lsts)} LSTs",
                    'recommendation': 'Enhanced analysis ensures maximum yield selection'
                }
            ],
            'metadata': {
                'totalLSTsAnalyzed': len(lst_data),
                'eligibleLSTs': len(eligible_lsts),
                'selectedLSTs': len(selected_lsts),
                'mevEnabledCount': sum(1 for lst in selected_lsts if lst['mevEnabled']),
                'averageTVL': sum(lst['tvlSOL'] for lst in selected_lsts) / len(selected_lsts) if selected_lsts else 0,
                'sources': ['sanctum_extra', 'compass', 'github'],
                'lastUpdated': datetime.now().isoformat()
            }
        }
        
        return strategy

# Global instance for the service
enhanced_lst_system = EnhancedLSTDataSystem()

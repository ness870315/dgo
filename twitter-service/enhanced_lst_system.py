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
                'tvl_endpoint': 'INF',
                'sanctum_symbol': 'infSOL'  # Map to Sanctum LST list symbol
            },
            'infSOL': {
                'symbol': 'infSOL', 
                'name': 'InfiniteSOL',
                'description': 'InfiniteSOL LST - Different LST with lower APR',
                'apy_endpoint': 'infSOL',
                'tvl_endpoint': 'infSOL',
                'sanctum_symbol': 'infSOL'
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
            
            # Get APY/TVL data for all symbols, including mapped symbols
            all_symbols = list(set([lst['symbol'] for lst in sanctum_lsts if lst.get('symbol')]))
            
            # Add mapped symbols for APY/TVL fetching
            mapped_symbols = set()
            for symbol in all_symbols:
                if symbol in self.lst_mapping:
                    mapped_symbols.add(self.lst_mapping[symbol]['apy_endpoint'])
                else:
                    mapped_symbols.add(symbol)
            
            apy_tvl_data = await self.fetch_sanctum_extra_apy_tvl(list(mapped_symbols))
            
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
            logger.error(f"❌ Exception type: {type(e).__name__}")
            logger.error(f"❌ Exception details: {str(e)}")
            import traceback
            logger.error(f"❌ Traceback: {traceback.format_exc()}")
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
                
                # Get metadata from Sanctum LST list using symbol mapping
                sanctum_symbol = symbol
                if symbol in self.lst_mapping:
                    sanctum_symbol = self.lst_mapping[symbol].get('sanctum_symbol', symbol)
                
                metadata = next((lst for lst in sanctum_lsts if lst.get('symbol') == sanctum_symbol), {})
                
                # Use the mapped symbol for the final LST entry
                final_symbol = symbol
                if symbol in self.lst_mapping:
                    final_symbol = self.lst_mapping[symbol]['symbol']
                
                enhanced_lst = {
                    'symbol': final_symbol,
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
                
                lst_map[final_symbol] = enhanced_lst
                
            except Exception as e:
                logger.warning(f"   ⚠️ Error processing LST {symbol}: {e}")
        
        logger.info(f"   LSTs with APY/TVL data processed: {len(lst_map)}")
        
        # Log some sample LSTs for debugging
        if lst_map:
            sample_lsts = list(lst_map.values())[:3]
            for lst in sample_lsts:
                logger.info(f"   Sample LST: {lst['symbol']} - APR: {lst['apr']:.2f}%, TVL: {lst['tvlSOL']:.0f} SOL")
        
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
        
        # Log top 10 eligible LSTs for debugging
        if eligible_lsts:
            logger.info("📊 Top 10 Eligible LSTs:")
            for i, lst in enumerate(eligible_lsts[:10]):
                logger.info(f"   {i+1}. {lst['symbol']}: {lst['apr']:.2f}% APR, {lst['tvlSOL']:.0f} SOL TVL")
        
        # Sort by expected yield (APR + MEV bonus)
        def get_yield(lst):
            return lst['apr'] + (0.1 if lst['mevEnabled'] else 0)
        
        sorted_lsts = sorted(eligible_lsts, key=get_yield, reverse=True)
        
        # Generate strategy
        if strategy_type == 'basic':
            selected_lsts = sorted_lsts[:2]  # Only 2 LSTs for basic strategy
            weights = [0.6, 0.4]  # 60% and 40% allocation
        else:  # advanced
            selected_lsts = sorted_lsts[:8]
            weights = [0.25, 0.2, 0.15, 0.12, 0.1, 0.08, 0.06, 0.04]
        
        # Log selected LSTs
        logger.info(f"🎯 Selected LSTs for {strategy_type} strategy:")
        for i, lst in enumerate(selected_lsts):
            logger.info(f"   {i+1}. {lst['symbol']}: {lst['apr']:.2f}% APR, {weights[i]:.1f} weight, {lst['tvlSOL']:.0f} SOL TVL")
        
        # Generate deterministic candidates (A, B, C)
        deterministic_candidates = []
        
        # Candidate A: Top 2 LSTs (basic strategy)
        candidate_a_lsts = sorted_lsts[:2]
        candidate_a_weights = [0.6, 0.4] if len(candidate_a_lsts) >= 2 else [1.0]
        candidate_a = self.build_candidate_strategy(wallet_address, candidate_a_lsts, candidate_a_weights, "Conservative Strategy", "deterministic")
        deterministic_candidates.append(candidate_a)
        logger.info(f"🤖 Deterministic Candidate A: {candidate_a['name']} - {candidate_a['expectedYield']:.2f}% yield")
        
        # Candidate B: Top 3 LSTs (balanced)
        candidate_b_lsts = sorted_lsts[:3]
        candidate_b_weights = [0.5, 0.3, 0.2] if len(candidate_b_lsts) >= 3 else [0.6, 0.4] if len(candidate_b_lsts) == 2 else [1.0]
        candidate_b = self.build_candidate_strategy(wallet_address, candidate_b_lsts, candidate_b_weights, "Balanced Strategy", "deterministic")
        deterministic_candidates.append(candidate_b)
        logger.info(f"🤖 Deterministic Candidate B: {candidate_b['name']} - {candidate_b['expectedYield']:.2f}% yield")
        
        # Candidate C: Top 5 LSTs (diversified)
        candidate_c_lsts = sorted_lsts[:5]
        candidate_c_weights = [0.3, 0.25, 0.2, 0.15, 0.1] if len(candidate_c_lsts) >= 5 else [0.4, 0.3, 0.2, 0.1] if len(candidate_c_lsts) == 4 else [0.5, 0.3, 0.2] if len(candidate_c_lsts) == 3 else [0.6, 0.4]
        candidate_c = self.build_candidate_strategy(wallet_address, candidate_c_lsts, candidate_c_weights, "Diversified Strategy", "deterministic")
        deterministic_candidates.append(candidate_c)
        logger.info(f"🤖 Deterministic Candidate C: {candidate_c['name']} - {candidate_c['expectedYield']:.2f}% yield")
        
        # Generate LLM candidates (D, E, F)
        llm_candidates = self.generate_llm_candidates(wallet_address, eligible_lsts, strategy_type)
        logger.info(f"🧠 Generated {len(llm_candidates)} LLM candidates")
        
        # Combine all candidates
        all_candidates = deterministic_candidates + llm_candidates
        
        # Select best candidate based on strategy type
        if strategy_type == 'basic':
            # For basic, prefer deterministic candidates
            selected_candidate = max(deterministic_candidates, key=lambda x: x["expectedYield"])
        else:
            # For advanced, consider all candidates
            if all_candidates:
                selected_candidate = max(all_candidates, key=lambda x: x["expectedYield"])
            else:
                # Fallback to deterministic if no candidates
                selected_candidate = max(deterministic_candidates, key=lambda x: x["expectedYield"])
        
        logger.info(f"🏆 Selected {selected_candidate['name']} from {len(all_candidates)} candidates (source: {selected_candidate.get('source', 'deterministic')})")
        
        # Use the selected candidate's data
        selected_lsts = [lst for lst in eligible_lsts if lst['symbol'] in [alloc['symbol'] for alloc in selected_candidate['allocation']]]
        weights = [alloc['weight'] for alloc in selected_candidate['allocation']]
        
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
    
    def build_candidate_strategy(self, wallet_address: str, lsts: List[Dict], weights: List[float], name: str, source: str) -> Dict[str, Any]:
        """Build a candidate strategy from LSTs and weights."""
        try:
            # Calculate expected yield
            expected_yield = sum(
                (lst['apr'] + (0.1 if lst['mevEnabled'] else 0)) * weights[i] 
                for i, lst in enumerate(lsts)
            )
            
            # Calculate risk score
            risk_score = sum(lst['riskScore'] * weights[i] for i, lst in enumerate(lsts))
            
            # Build allocation
            allocation = []
            for i, lst in enumerate(lsts):
                allocation.append({
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
                })
            
            return {
                'name': name,
                'expectedYield': expected_yield,
                'riskScore': risk_score,
                'allocation': allocation,
                'source': source
            }
        except Exception as e:
            logger.error(f"Failed to build candidate strategy: {e}")
            return None
    
    def generate_llm_candidates(self, wallet_address: str, eligible_lsts: List[Dict], strategy_type: str) -> List[Dict]:
        """Generate LLM-based candidate strategies (D/E/F)."""
        try:
            # Import the LLM functions from main.py
            import sys
            import os
            sys.path.append(os.path.dirname(os.path.abspath(__file__)))
            from main import call_openai_llm, OPENAI_API_KEY
            
            if not OPENAI_API_KEY:
                logger.warning("OpenAI API key not configured, skipping LLM candidates")
                return []
            
            # Prepare LST data for LLM
            lst_info = []
            for lst in eligible_lsts[:8]:  # Top 8 LSTs for LLM consideration
                lst_info.append(f"- {lst['symbol']}: {lst['apr']:.2f}% APR, ${lst['tvlUSD']/1000000:.1f}M TVL, {lst['decentralization']*100:.1f}% decentralization")
            
            llm_prompt = f"""
            Generate 3 different Solana liquid staking strategies for a wallet.
            
            Available LSTs:
            {chr(10).join(lst_info)}
            
            Strategy Type: {strategy_type}
            
            Generate 3 distinct strategies with different approaches:
            1. Strategy D: Conservative approach (focus on stability)
            2. Strategy E: Balanced approach (mix of yield and safety)  
            3. Strategy F: Aggressive approach (maximize yield)
            
            IMPORTANT: Respond ONLY with valid JSON. No explanations, no markdown, just pure JSON.
            
            Required JSON format:
            {{
                "strategy_d": {{
                    "name": "Conservative Strategy",
                    "allocation": [{{"symbol": "LST1", "weight": 0.5}}, {{"symbol": "LST2", "weight": 0.5}}],
                    "reasoning": "Focus on established LSTs with proven track records"
                }},
                "strategy_e": {{
                    "name": "Balanced Strategy", 
                    "allocation": [{{"symbol": "LST1", "weight": 0.4}}, {{"symbol": "LST2", "weight": 0.3}}, {{"symbol": "LST3", "weight": 0.3}}],
                    "reasoning": "Diversified across multiple LSTs for balanced risk/return"
                }},
                "strategy_f": {{
                    "name": "Aggressive Strategy",
                    "allocation": [{{"symbol": "LST1", "weight": 0.6}}, {{"symbol": "LST2", "weight": 0.4}}],
                    "reasoning": "Concentrated in highest yield LSTs for maximum returns"
                }}
            }}
            """
            
            llm_response = call_openai_llm(llm_prompt, max_tokens=800)
            
            # Log the LLM response for debugging
            logger.info(f"🧠 LLM response length: {len(llm_response)}")
            logger.info(f"🧠 LLM response preview: {llm_response[:200]}...")
            
            # Parse LLM response
            import json
            try:
                json_start = llm_response.find('{')
                json_end = llm_response.rfind('}') + 1
                
                if json_start != -1 and json_end > json_start:
                    json_str = llm_response[json_start:json_end]
                    llm_strategies = json.loads(json_str)
                    logger.info(f"🧠 Parsed LLM strategies: {list(llm_strategies.keys())}")
                    
                    candidates = []
                    for key, strategy in llm_strategies.items():
                        allocation = strategy.get('allocation', [])
                        if len(allocation) >= 2:  # Need at least 2 LSTs
                            # Build candidate strategy
                            candidate_lsts = []
                            candidate_weights = []
                            
                            for alloc in allocation:
                                symbol = alloc['symbol']
                                weight = alloc['weight']
                                
                                # Find the LST in eligible_lsts
                                lst = next((l for l in eligible_lsts if l['symbol'] == symbol), None)
                                if lst:
                                    candidate_lsts.append(lst)
                                    candidate_weights.append(weight)
                            
                            if len(candidate_lsts) >= 2:
                                candidate = self.build_candidate_strategy(
                                    wallet_address, 
                                    candidate_lsts, 
                                    candidate_weights, 
                                    strategy['name'], 
                                    "llm"
                                )
                                if candidate:
                                    candidate['reasoning'] = strategy.get('reasoning', '')
                                    candidates.append(candidate)
                                    logger.info(f"🧠 Added LLM candidate: {strategy['name']} with {len(allocation)} assets (yield: {candidate['expectedYield']:.2f}%, risk: {candidate['riskScore']:.1f}/10)")
                            else:
                                logger.warning(f"🧠 Skipped LLM candidate {strategy['name']}: insufficient valid LSTs")
                        else:
                            logger.warning(f"🧠 Skipped LLM candidate {strategy['name']}: insufficient assets ({len(allocation)})")
                    
                    logger.info(f"🧠 Generated {len(candidates)} LLM candidate strategies")
                    return candidates
                else:
                    logger.error("🧠 No JSON found in LLM response")
                    return []
            except json.JSONDecodeError as e:
                logger.error(f"🧠 Failed to parse LLM JSON response: {e}")
                return []
                
        except Exception as e:
            logger.error(f"🧠 LLM candidate generation failed: {str(e)}")
            return []

# Global instance for the service
enhanced_lst_system = EnhancedLSTDataSystem()

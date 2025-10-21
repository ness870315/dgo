#!/usr/bin/env python3
"""
Debug Moralis API Response
"""

import requests
import os

MORALIS_API_KEY = os.getenv('MORALIS_API_KEY')

def debug_moralis_response():
    wallet_address = "82ytegx28N1rhU7e4rxY8MKoCTmuyZcuctx8LJL87Un8"
    
    print(f"🔍 Debugging Moralis API response for wallet: {wallet_address}")
    
    # Test SOL balance endpoint
    print("\n1️⃣ Testing SOL balance endpoint...")
    url = f"https://solana-gateway.moralis.io/account/mainnet/{wallet_address}/balance"
    headers = {"X-API-Key": MORALIS_API_KEY}
    
    try:
        response = requests.get(url, headers=headers, timeout=10)
        print(f"Status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"SOL Balance Response: {data}")
        else:
            print(f"Error: {response.text}")
    except Exception as e:
        print(f"Error: {e}")
    
    # Test token balances endpoint
    print("\n2️⃣ Testing token balances endpoint...")
    url = f"https://solana-gateway.moralis.io/account/mainnet/{wallet_address}/tokens"
    params = {"excludeSpam": "true"}
    
    try:
        response = requests.get(url, headers=headers, params=params, timeout=10)
        print(f"Status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"Token Balances Response: {data}")
            print(f"Number of tokens: {len(data) if isinstance(data, list) else 'Not a list'}")
        else:
            print(f"Error: {response.text}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    debug_moralis_response()

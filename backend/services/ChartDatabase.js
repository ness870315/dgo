import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';

/**
 * Centralized Chart Database
 * Stores all chart data permanently with incremental updates
 * Multiple users access the same cached data - no duplicate API calls
 */
class ChartDatabase {
    constructor() {
        this.dbPath = path.join(process.cwd(), 'data', 'charts.db');
        this.ensureDataDir();
        this.db = null;
        this.initializeDatabase();
    }

    ensureDataDir() {
        const dataDir = path.join(process.cwd(), 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
    }

    initializeDatabase() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    console.error('❌ Database connection failed:', err.message);
                    reject(err);
                } else {
                    console.log('✅ Chart database connected');
                    this.createTables().then(resolve).catch(reject);
                }
            });
        });
    }

    async createTables() {
        const tables = [
            // Raw swap transactions (never expires)
            `CREATE TABLE IF NOT EXISTS swaps (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                signature TEXT UNIQUE NOT NULL,
                pool_address TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                price REAL NOT NULL,
                volume_usd REAL NOT NULL,
                source TEXT,
                raw_data TEXT,
                created_at INTEGER DEFAULT (strftime('%s', 'now'))
            )`,

            // Materialized candles (pre-computed OHLCV)
            `CREATE TABLE IF NOT EXISTS candles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pool_address TEXT NOT NULL,
                timeframe TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                open REAL NOT NULL,
                high REAL NOT NULL,
                low REAL NOT NULL,
                close REAL NOT NULL,
                volume REAL NOT NULL,
                created_at INTEGER DEFAULT (strftime('%s', 'now')),
                updated_at INTEGER DEFAULT (strftime('%s', 'now')),
                UNIQUE(pool_address, timeframe, timestamp)
            )`,

            // Pool metadata (cache pool addresses)
            `CREATE TABLE IF NOT EXISTS pools (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                token_mint TEXT UNIQUE NOT NULL,
                pool_address TEXT NOT NULL,
                dex_source TEXT,
                liquidity_usd REAL,
                is_active BOOLEAN DEFAULT 1,
                created_at INTEGER DEFAULT (strftime('%s', 'now')),
                updated_at INTEGER DEFAULT (strftime('%s', 'now'))
            )`,

            // Backfill progress tracking
            `CREATE TABLE IF NOT EXISTS backfill_progress (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pool_address TEXT UNIQUE NOT NULL,
                last_processed_signature TEXT,
                last_processed_timestamp INTEGER,
                total_swaps INTEGER DEFAULT 0,
                last_backfill_at INTEGER DEFAULT (strftime('%s', 'now')),
                created_at INTEGER DEFAULT (strftime('%s', 'now'))
            )`
        ];

        for (const sql of tables) {
            await this.run(sql);
        }

        // Create indexes for performance
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_swaps_pool_timestamp ON swaps(pool_address, timestamp)',
            'CREATE INDEX IF NOT EXISTS idx_swaps_signature ON swaps(signature)',
            'CREATE INDEX IF NOT EXISTS idx_candles_pool_timeframe ON candles(pool_address, timeframe)',
            'CREATE INDEX IF NOT EXISTS idx_candles_timestamp ON candles(timestamp)',
            'CREATE INDEX IF NOT EXISTS idx_pools_token_mint ON pools(token_mint)',
            'CREATE INDEX IF NOT EXISTS idx_backfill_pool ON backfill_progress(pool_address)'
        ];

        for (const sql of indexes) {
            await this.run(sql);
        }

        console.log('✅ Chart database tables created');
    }

    run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ id: this.lastID, changes: this.changes });
                }
            });
        });
    }

    get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    all(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    /**
     * Store raw swap transactions
     */
    async storeSwaps(swaps) {
        if (!swaps || swaps.length === 0) return;

        const stmt = this.db.prepare(`
            INSERT OR IGNORE INTO swaps 
            (signature, pool_address, timestamp, price, volume_usd, source, raw_data)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        for (const swap of swaps) {
            await new Promise((resolve, reject) => {
                stmt.run([
                    swap.signature,
                    swap.poolAddress,
                    swap.timestamp,
                    swap.price,
                    swap.volumeUsd,
                    swap.source,
                    JSON.stringify(swap.rawData)
                ], function(err) {
                    if (err) reject(err);
                    else resolve();
                });
            });
        }

        stmt.finalize();
        console.log(`💾 Stored ${swaps.length} swaps in database`);
    }

    /**
     * Get candles for a pool and timeframe
     * Returns pre-computed OHLCV data instantly
     */
    async getCandles(poolAddress, timeframe, limit = null) {
        let sql = `
            SELECT timestamp, open, high, low, close, volume
            FROM candles 
            WHERE pool_address = ? AND timeframe = ?
            ORDER BY timestamp DESC
        `;
        
        const params = [poolAddress, timeframe];
        
        if (limit) {
            sql += ` LIMIT ?`;
            params.push(limit);
        }

        const candles = await this.all(sql, params);
        
        // Convert to standard format
        return candles.map(candle => ({
            timestamp: candle.timestamp * 1000, // Convert to milliseconds for frontend
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
            volume: candle.volume
        })).reverse(); // Return in chronological order
    }

    /**
     * Update materialized candles with new swaps
     */
    async updateCandles(poolAddress, timeframe) {
        console.log(`🔄 Updating candles for ${poolAddress.substring(0, 8)} (${timeframe})`);

        // Get all swaps for this pool
        const swaps = await this.all(`
            SELECT timestamp, price, volume_usd
            FROM swaps 
            WHERE pool_address = ?
            ORDER BY timestamp ASC
        `, [poolAddress]);

        if (swaps.length === 0) {
            console.log(`⚠️ No swaps found for ${poolAddress.substring(0, 8)}`);
            return;
        }

        // Generate candles from swaps
        const candles = this.generateCandlesFromSwaps(swaps, timeframe);

        // Store/update candles in database
        for (const candle of candles) {
            await this.run(`
                INSERT OR REPLACE INTO candles 
                (pool_address, timeframe, timestamp, open, high, low, close, volume, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, strftime('%s', 'now'))
            `, [
                poolAddress,
                timeframe,
                candle.timestamp,
                candle.open,
                candle.high,
                candle.low,
                candle.close,
                candle.volume
            ]);
        }

        console.log(`✅ Updated ${candles.length} candles for ${poolAddress.substring(0, 8)} (${timeframe})`);
    }

    /**
     * Generate OHLCV candles from raw swaps
     */
    generateCandlesFromSwaps(swaps, timeframe) {
        const stepMin = this.getTimeframeMinutes(timeframe);
        const buckets = new Map();

        for (const swap of swaps) {
            const bucketMin = Math.floor((swap.timestamp / 60) / stepMin) * stepMin;
            const bucketTime = bucketMin * 60;

            const candle = buckets.get(bucketTime);
            if (!candle) {
                buckets.set(bucketTime, {
                    timestamp: bucketTime,
                    open: swap.price,
                    high: swap.price,
                    low: swap.price,
                    close: swap.price,
                    volume: swap.volume_usd
                });
            } else {
                candle.high = Math.max(candle.high, swap.price);
                candle.low = Math.min(candle.low, swap.price);
                candle.close = swap.price; // Last price in timeframe
                candle.volume += swap.volume_usd;
            }
        }

        return [...buckets.values()].sort((a, b) => a.timestamp - b.timestamp);
    }

    /**
     * Store pool address for a token
     */
    async storePoolAddress(tokenMint, poolAddress, dexSource = null, liquidityUsd = null) {
        await this.run(`
            INSERT OR REPLACE INTO pools 
            (token_mint, pool_address, dex_source, liquidity_usd, updated_at)
            VALUES (?, ?, ?, ?, strftime('%s', 'now'))
        `, [tokenMint, poolAddress, dexSource, liquidityUsd]);

        console.log(`💾 Stored pool address for ${tokenMint.substring(0, 8)}: ${poolAddress.substring(0, 8)}`);
    }

    /**
     * Get pool address for a token
     */
    async getPoolAddress(tokenMint) {
        const pool = await this.get(`
            SELECT pool_address FROM pools 
            WHERE token_mint = ? AND is_active = 1
            ORDER BY liquidity_usd DESC
        `, [tokenMint]);

        return pool ? pool.pool_address : null;
    }

    /**
     * Update backfill progress
     */
    async updateBackfillProgress(poolAddress, lastSignature, lastTimestamp, totalSwaps) {
        await this.run(`
            INSERT OR REPLACE INTO backfill_progress 
            (pool_address, last_processed_signature, last_processed_timestamp, total_swaps, last_backfill_at)
            VALUES (?, ?, ?, ?, strftime('%s', 'now'))
        `, [poolAddress, lastSignature, lastTimestamp, totalSwaps]);
    }

    /**
     * Get backfill progress
     */
    async getBackfillProgress(poolAddress) {
        return await this.get(`
            SELECT * FROM backfill_progress WHERE pool_address = ?
        `, [poolAddress]);
    }

    /**
     * Get database statistics
     */
    async getStats() {
        const stats = await this.all(`
            SELECT 
                (SELECT COUNT(*) FROM swaps) as total_swaps,
                (SELECT COUNT(*) FROM candles) as total_candles,
                (SELECT COUNT(*) FROM pools) as total_pools,
                (SELECT COUNT(DISTINCT pool_address) FROM swaps) as active_pools
        `);

        return stats[0];
    }

    getTimeframeMinutes(timeframe) {
        switch (timeframe) {
            case '1MIN': return 1;
            case '5MIN': return 5;
            case '15MIN': return 15;
            case '1H': return 60;
            case '4H': return 240;
            case '1D': return 1440;
            default: return 5;
        }
    }

    close() {
        if (this.db) {
            this.db.close();
            console.log('🔒 Chart database closed');
        }
    }
}

export default ChartDatabase;

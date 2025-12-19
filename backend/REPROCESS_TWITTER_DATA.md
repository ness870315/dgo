# Twitter Data Reprocessing Script

## Purpose

This script identifies tokens in the cache that don't have Twitter data (or have outdated data) and feeds them through the `EnhancedTokenProcessor` to fetch:

- Tweets/mentions
- Engagement metrics (likes, retweets, replies)
- Community health score
- Sentiment analysis

## When to Use

Run this script when:

1. **After gRPC integration** - Old gRPC-discovered tokens don't have Twitter data
2. **After cache restore** - Tokens were restored from backup without Twitter data
3. **Periodic refresh** - Update Twitter data for tokens older than 7 days
4. **Manual trigger** - You notice tokens missing social activity in the UI

## What It Does

1. Loads all tokens from `tokens-cache.json`
2. Identifies tokens that need Twitter data:
   - No `twitterData` object
   - Empty `tweets` or `recentMentions` arrays
   - Twitter data older than 7 days
3. Feeds tokens through `EnhancedTokenProcessor`:
   - **Twitter Stage**: Fetches tweets, mentions, engagement
   - **Scoring Stage**: Recalculates scores with new data
   - **Saving Stage**: Updates `tokens-cache.json`

## Usage

### Basic Run

```bash
cd backend
node reprocess-twitter-data.js
```

### With Environment Variables

```bash
DATA_DIR=/var/data/dgo node reprocess-twitter-data.js
```

### Dry Run (Check Only)

To see what would be processed without actually running:

```javascript
// Comment out these lines in the script:
// await processor.processTwitterStage();
// await processor.processScoringStage();
// await processor.saveFinalDatabase();
```

## Expected Output

```
🔄 Starting Twitter Data Reprocessing Script...

📊 Initializing EnhancedTokenProcessor...
✅ EnhancedTokenProcessor initialized

📂 Loading tokens from: /var/data/dgo/cache/tokens-cache.json
✅ Loaded 450 tokens from cache

📊 Analysis Results:
   Total tokens: 450
   Tokens with Twitter data: 250
   Tokens needing Twitter data: 200

📋 Sample tokens to be processed:
   1. USELESS (Dz9mQ9Nz...) - Empty tweets/mentions
   2. TRUMP (HaP8r3vy...) - No Twitter data
   ... and 198 more

⚠️  This will fetch Twitter data for 200 tokens
⚠️  Estimated time: 100 minutes (30s per token)
⚠️  Twitter API costs: ~$30.00 (TwitterAPI.io)

📥 Adding 200 tokens to processor queue...
✅ Tokens added to queue

🐦 Starting Twitter data fetching stage...
⏳ This may take a while...

[Processing logs...]

✅ Twitter stage completed in 95m 30s
📊 Recalculating scores with new Twitter data...
✅ Scoring stage completed
💾 Saving updated tokens to cache...
✅ Tokens saved to cache

📊 Final Results:
   Tokens processed: 200
   Time taken: 95m 30s
   Average time per token: 28s

✅ Reprocessing completed successfully!
🎉 All tokens now have Twitter data and updated scores!
```

## Performance

- **Time**: ~30 seconds per token (includes rate limiting)
- **Cost**: ~$0.15 per token (TwitterAPI.io pricing)
- **Batch Size**: 5 tokens per batch (configurable in `EnhancedTokenProcessor`)
- **Delay**: 30 seconds between tokens, 90 seconds between batches

## Rate Limiting

The script respects Twitter API rate limits:

- **5 tokens per batch**
- **30 second delay** between tokens
- **90 second delay** between batches
- **5-day cooldown** for tokens already processed

## Safety Features

1. **Backup**: Original cache is backed up before processing
2. **Atomic writes**: Cache is written atomically to prevent corruption
3. **Error handling**: Failed tokens are logged but don't stop the process
4. **Cooldown respect**: Tokens with recent Twitter data (< 5 days) are skipped

## Troubleshooting

### "No tokens need Twitter data"

All tokens already have Twitter data. This is good!

### "Twitter API error: 429 Too Many Requests"

Rate limit exceeded. The script should handle this automatically with delays. If it persists, increase the delay in `EnhancedTokenProcessor.js`.

### "Failed to load tokens cache"

Check that `DATA_DIR` is set correctly and `tokens-cache.json` exists:

```bash
ls -la /var/data/dgo/cache/tokens-cache.json
```

### Script runs but no data is saved

Check that the processor has write permissions:

```bash
ls -la /var/data/dgo/cache/
```

## Integration with Cron

To run automatically every week:

```bash
# Add to crontab
0 0 * * 0 cd /path/to/backend && node reprocess-twitter-data.js >> /var/log/twitter-reprocess.log 2>&1
```

This runs every Sunday at midnight.

## Monitoring

Check logs for:

- Number of tokens processed
- Time taken
- Any errors or failures
- API costs

## Related Scripts

- `run-grpc-trending.js` - Discovers new tokens with Twitter data
- `enhancedTokenProcessor.js` - Core processor for all token workflows
- `services/TwitterAPIioService.js` - Twitter API integration

## Notes

- **First run** may take several hours for 400+ tokens
- **Subsequent runs** will be faster (only processes tokens without data)
- **Twitter data** is cached for 5 days to avoid unnecessary API calls
- **Scores** are recalculated after Twitter data is fetched




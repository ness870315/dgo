// Story Framework for Degen Oracle Auto-Tweets
// Mix & match these modules to create engaging, non-repetitive promotional tweets

export const storyFramework = {
  // 1. The Hook (Problem Awareness)
  hooks: [
    "Volume can be faked. Hype can be faked. Communities cannot.",
    "Charts tell you what happened. Communities tell you what will happen.",
    "DexScreener trends? Half of them are farmed hype. We cut through the noise.",
    "How many times have you chased volume, only to get rugged? That ends now.",
    "❌ Fake volume.\n❌ Fake hype.\n✅ Real communities.\n\nThat's what builds the next 1000x.",
    "While you're glued to candles, whales are front-running the cults.",
    "Other screeners = noise.\nDegen Oracle = signal.",
    "Every degen wants to be a KOL.\nBut how do you prove your calls?"
  ],

  // 2. The Solution (What Degen Oracle Is)
  solutions: [
    "Degen Oracle is the AI-powered screener built for meme coins on Solana.",
    "We crunch on-chain transactions + sentiment + social signals to spot organic cults before they blow up.",
    "Forget fake volume. Forget bot trades. Degen Oracle filters real community momentum.",
    "Our AI Core = your unfair edge in catching the next 1000x.",
    "That's what Degen Oracle tracks.",
    "We built Oracle AI to crunch:\n📊 On-chain data\n💬 Market sentiment\n🔥 Social signals\n\nSo you catch the next gem before the herd.",
    "We don't just track volume.\nWe measure organic momentum + cult potential.",
    "🚀 Catch the next 1000x.\n🤖 Powered by Oracle AI.\n📊 Crunching data, sentiment & social."
  ],

  // 3. The Unique Edge (Differentiation)
  edges: [
    "While others stare at candles, Degen Oracle builds AI-powered thesis for you.",
    "Every token gets scored on organic growth, sentiment & cult potential.",
    "Other screeners show you what's trending. We show you what will matter.",
    "Degen Oracle isn't just a screener. It's your KOL launcher.",
    "Because coins don't moon on fake trades…\nThey moon on communities. 🌐",
    "We don't chase volume.\nWe chase conviction.",
    "Forget DexScreener hype trains.\nWe find the signal in the noise."
  ],

  // 4. The Game / Social Layer (Proof of Call + KOL Leaderboard)
  gameLayers: [
    "Make your call. Lock it in. Share it on X. Build your track record.",
    "Every trade is a chance to prove yourself as the next KOL.",
    "Your dashboard keeps receipts: when you called it, what market cap, how far it ran.",
    "The leaderboard never lies — are you ready to climb?",
    "With Degen Oracle:\n⚡ Make a call.\n🐦 Auto-share to X.\n📈 Track multipliers on your dashboard.\n🏆 Climb the Leaderboard.\n\nReceipts don't lie.",
    "🐦 Built for KOLs who want to rise.",
    "Track your calls. Prove your alpha. Build your reputation.",
    "Every call = proof of work.\nEvery win = credibility earned."
  ],

  // 5. The Aspirational Close (Vision / Hype)
  closes: [
    "Spot the next cult before it goes viral. 🔮",
    "AI-driven conviction for the degen era. ⚡",
    "Cults > Charts. Oracle > Noise.",
    "The next KOL is you. Will you rise?",
    "Catch the next 1000x with AI precision.",
    "The Next-Gen Screener is here.",
    "Your edge in the degen era. 🔮",
    "Alpha waits for no one. ⚡",
    "Stop guessing. Start knowing.",
    "The future of meme coin discovery is AI."
  ]
};

// Helper function to randomly select an element from an array
function randomPick(array) {
  return array[Math.floor(Math.random() * array.length)];
}

// Generate a promotional tweet by mixing modules
export function generateTweet(includeLinkProbability = 0.4) {
  // Strategy 1: Full Story (Hook + Solution + Edge + Game + Close)
  // Strategy 2: Short Punch (Hook + Solution + Close)
  // Strategy 3: Feature Focus (Solution + Edge + Close)
  // Strategy 4: Game Layer Focus (Game + Edge + Close)
  
  const strategies = [
    // Full story (30%)
    () => {
      return [
        randomPick(storyFramework.hooks),
        randomPick(storyFramework.solutions),
        randomPick(storyFramework.edges),
        randomPick(storyFramework.gameLayers),
        randomPick(storyFramework.closes)
      ].join('\n\n');
    },
    // Short punch (30%)
    () => {
      return [
        randomPick(storyFramework.hooks),
        randomPick(storyFramework.solutions),
        randomPick(storyFramework.closes)
      ].join('\n\n');
    },
    // Feature focus (20%)
    () => {
      return [
        randomPick(storyFramework.solutions),
        randomPick(storyFramework.edges),
        randomPick(storyFramework.closes)
      ].join('\n\n');
    },
    // Game layer focus (20%)
    () => {
      return [
        randomPick(storyFramework.gameLayers),
        randomPick(storyFramework.edges),
        randomPick(storyFramework.closes)
      ].join('\n\n');
    }
  ];

  // Randomly select a strategy
  const strategy = randomPick(strategies);
  let tweet = strategy();

  // Add link with probability
  if (Math.random() < includeLinkProbability) {
    tweet += '\n\n👉 degen-oracle.com';
  }

  return tweet;
}

// Generate a tweet using OpenAI LLM for more natural variation
export async function generateTweetWithLLM(openaiService) {
  // Get base components
  const hook = randomPick(storyFramework.hooks);
  const solution = randomPick(storyFramework.solutions);
  const edge = randomPick(storyFramework.edges);
  const gameLayer = randomPick(storyFramework.gameLayers);
  const close = randomPick(storyFramework.closes);
  
  const includeLink = Math.random() < 0.4;
  
  // Build prompt for OpenAI
  const prompt = `You are crafting a promotional tweet for Degen Oracle, an AI-powered meme coin screener for Solana.

Use these story elements to create ONE engaging tweet (max 280 chars):

Hook: ${hook}
Solution: ${solution}
Edge: ${edge}
Game Layer: ${gameLayer}
Close: ${close}

Rules:
- Mix 2-3 of these elements naturally
- Keep crypto Twitter vibes (emojis ok, but not excessive)
- Sound confident and hype
- Make it feel organic, not corporate
- NO HASHTAGS - avoid using # symbols
${includeLink ? '- End with: 👉 degen-oracle.com' : '- DO NOT include any links'}

Tweet:`;

  try {
    if (!openaiService || !openaiService.isInitialized) {
      console.log('⚠️ OpenAI service not available, using template');
      return generateTweet(includeLink ? 1 : 0);
    }

    const completion = await openaiService.generateCompletion(prompt, {
      maxTokens: 150,
      temperature: 0.8,
      model: 'gpt-3.5-turbo' // Use faster model for tweets
    });

    return completion.trim() || generateTweet(includeLink ? 1 : 0); // Fallback to template
  } catch (error) {
    console.error('❌ OpenAI tweet generation failed, using template:', error.message);
    return generateTweet(includeLink ? 1 : 0); // Fallback to template
  }
}


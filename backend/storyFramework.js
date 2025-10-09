// Story Framework for Degen Oracle Auto-Tweets
// Mix & match these modules to create engaging, non-repetitive promotional tweets

export const storyFramework = {
  // 1. The Hook (Problem Awareness)
  hooks: [
    "Volume can be faked. Hype can be faked. Communities cannot.",
    "Charts tell you what happened. Communities tell you what will happen.",
    "DexScreener trends? Half of them are farmed hype. We cut through the noise.",
    "How many times have you chased volume, only to get rugged? That ends now.",
    "Fake volume, fake hype. Real communities build the next 1000x.",
    "While you're glued to candles, whales are front-running the cults.",
    "Other screeners = noise. Degen Oracle = signal.",
    "Every degen wants to be a KOL. But how do you prove your calls?"
  ],

  // 2. The Solution (What Degen Oracle Is)
  solutions: [
    "Degen Oracle is the AI-powered screener built for meme coins on Solana.",
    "We crunch on-chain transactions + sentiment + social signals to spot organic cults.",
    "Forget fake volume. Forget bot trades. Degen Oracle filters real community momentum.",
    "Our AI Core = your unfair edge in catching the next 1000x.",
    "That's what Degen Oracle tracks.",
    "Oracle AI crunches on-chain data, market sentiment, and social signals.",
    "We measure organic momentum + cult potential.",
    "Catch the next 1000x. Powered by Oracle AI."
  ],

  // 3. The Unique Edge (Differentiation)
  edges: [
    "While others stare at candles, Degen Oracle builds AI-powered thesis for you.",
    "Every token gets scored on organic growth, sentiment & cult potential.",
    "Other screeners show you what's trending. We show you what will matter.",
    "Degen Oracle isn't just a screener. It's your KOL launcher.",
    "Coins don't moon on fake trades. They moon on communities.",
    "We don't chase volume. We chase conviction.",
    "Forget DexScreener hype trains. We find the signal in the noise."
  ],

  // 4. The Game / Social Layer (Proof of Call + KOL Leaderboard)
  gameLayers: [
    "Make your call. Lock it in. Share it on X. Build your track record.",
    "Every trade is a chance to prove yourself as the next KOL.",
    "Your dashboard keeps receipts: when you called it, what mcap, how far it ran.",
    "The leaderboard never lies. Are you ready to climb?",
    "Make a call. Auto-share to X. Track multipliers. Climb the leaderboard.",
    "Built for KOLs who want to rise.",
    "Track your calls. Prove your alpha. Build your reputation.",
    "Every call = proof of work. Every win = credibility earned."
  ],

  // 5. The Aspirational Close (Vision / Hype)
  closes: [
    "Spot the next cult before it goes viral",
    "AI-driven conviction for the degen era",
    "Cults > Charts. Oracle > Noise",
    "The next KOL is you. Will you rise?",
    "Catch the next 1000x with AI precision",
    "The Next-Gen Screener is here",
    "Your edge in the degen era",
    "Alpha waits for no one",
    "Stop guessing. Start knowing",
    "The future of meme coin discovery is AI"
  ],

  // 6. Cult & KOL Spotting (Spotting Cults & Building Reputation)
  cultSpotting: [
    "Spot the next cult. Make the call. Become the KOL.",
    "Every cult starts with one call.",
    "Spot early. Call loud. Earn trust.",
    "Call the cults, build the clout."
  ],

  // 7. Numbers & Data Focus (Data-Driven Conviction)
  numbersFocus: [
    "We crunch the numbers. You make the call.",
    "Numbers don't lie. Calls make legends.",
    "Crunch the data, call the future.",
    "We run the math, you run the timeline."
  ],

  // 8. On-Chain Truth (On-Chain > Everything Else)
  onChainTruth: [
    "On-chain data > rumors.",
    "Alpha lives on-chain.",
    "Forget narratives. Follow the chain.",
    "On-chain data is the only truth."
  ],

  // 9. Community as Core (Community = Utility)
  communityCore: [
    "Community is the utility.",
    "Hype fades. Community holds.",
    "Tokens pump. Community lasts.",
    "No community, no cult."
  ],

  // 10. Blended Power Statements (Multi-Concept Punchlines)
  blendedPower: [
    "Spot the next cult with on-chain data. Become the trusted KOL.",
    "We crunch numbers, community makes the cult.",
    "On-chain data + community = conviction.",
    "Spot the cult. Make the call. Community is the utility.",
    "Crunch the numbers. Trust the chain. Build the community.",
    "Alpha is on-chain. Power is in the community."
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
  // Strategy 5: Cult Spotting Focus (CultSpotting + OnChain/Numbers + Close)
  // Strategy 6: Data-Driven (NumbersFocus + OnChainTruth + Close)
  // Strategy 7: Community First (CommunityCore + CultSpotting + Close)
  // Strategy 8: Blended Power (BlendedPower standalone or + Close)
  
  const strategies = [
    // Single punchy line (30%) - Just a hook or blended
    () => {
      return randomPick([
        ...storyFramework.hooks,
        ...storyFramework.blendedPower,
        ...storyFramework.cultSpotting
      ]);
    },
    // One-liner with close (25%)
    () => {
      return `${randomPick(storyFramework.cultSpotting)} ${randomPick(storyFramework.closes)}`;
    },
    // Two elements (20%)
    () => {
      return [
        randomPick([...storyFramework.hooks, ...storyFramework.blendedPower]),
        randomPick(storyFramework.closes)
      ].join(' ');
    },
    // Data + close (15%)
    () => {
      return `${randomPick(storyFramework.numbersFocus)} ${randomPick(storyFramework.closes)}`;
    },
    // Community + close (10%)
    () => {
      return `${randomPick(storyFramework.communityCore)} ${randomPick(storyFramework.closes)}`;
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
  // Get base components from ALL categories
  const allComponents = [
    randomPick(storyFramework.hooks),
    randomPick(storyFramework.solutions),
    randomPick(storyFramework.edges),
    randomPick(storyFramework.gameLayers),
    randomPick(storyFramework.closes),
    randomPick(storyFramework.cultSpotting),
    randomPick(storyFramework.numbersFocus),
    randomPick(storyFramework.onChainTruth),
    randomPick(storyFramework.communityCore),
    randomPick(storyFramework.blendedPower)
  ];
  
  // Randomly select 3-5 components for variety
  const selectedComponents = [];
  const numComponents = Math.floor(Math.random() * 3) + 3; // 3-5 components
  for (let i = 0; i < numComponents; i++) {
    const component = allComponents[Math.floor(Math.random() * allComponents.length)];
    if (!selectedComponents.includes(component)) {
      selectedComponents.push(component);
    }
  }
  
  const includeLink = Math.random() < 0.4;
  
  // Personality variations for daily tweets (similar to mention service)
  const personalities = [
    'Expert KOL - Confident, knows his shit, short and punchy',
    'Cult Spotter - Focus on finding early gems and building KOL reputation',
    'Data-Driven Chad - Drop numbers and facts, keep it casual',
    'Community Builder - Everything is about the people and conviction',
    'Mysterious Insider - Hint at alpha without saying too much',
    'Hype Beast - Maximum energy, FOMO vibes, no middle ground'
  ];
  
  const personality = randomPick(personalities);
  
  // Build prompt for OpenAI
  const prompt = `You are @dgnoracle promoting Degen Oracle, an AI-powered meme coin screener for Solana.

PERSONALITY: ${personality}

Story elements (use 1-2 max):
${selectedComponents.slice(0, 3).map((c, i) => `${i + 1}. ${c}`).join('\n')}

Generate ONE tweet (max 180 chars):
- SHORT and PUNCHY - Twitter users scroll fast
- ABSOLUTELY NO HASHTAGS - Do NOT use # symbols at all, NEVER include #degenoracle, #solana, #crypto or ANY hashtags
- Minimal emojis (0-2 max)
- Confident degen vibes
- Focus on: spotting cults, being a KOL, on-chain data
${includeLink ? '- End with: 👉 degen-oracle.com' : '- NO links'}

IMPORTANT: Your response must NOT contain any # symbols or hashtags. This is critical.

Tweet:`;

  try {
    if (!openaiService || !openaiService.isInitialized) {
      console.log('⚠️ OpenAI service not available, using template');
      return generateTweet(includeLink ? 1 : 0);
    }

    const completion = await openaiService.generateCompletion(prompt, {
      maxTokens: 150,
      temperature: 0.8,
      model: 'gpt-5-mini' // Use GPT-5 mini for creative tweets
    });

    // Post-process: Remove any hashtags if LLM added them anyway
    let cleanedTweet = completion.trim();
    cleanedTweet = cleanedTweet.replace(/#\w+/g, '').replace(/\s+/g, ' ').trim();
    
    return cleanedTweet || generateTweet(includeLink ? 1 : 0); // Fallback to template
  } catch (error) {
    console.error('❌ OpenAI tweet generation failed, using template:', error.message);
    return generateTweet(includeLink ? 1 : 0); // Fallback to template
  }
}


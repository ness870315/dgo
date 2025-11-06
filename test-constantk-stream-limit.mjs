import Client, { CommitmentLevel } from "@triton-one/yellowstone-grpc";
import bs58 from "bs58";

const ENDPOINT = process.env.CONSTANT_K_GRPC_ENDPOINT || "http://grpc.constant-k.com/";
const API_KEY = process.env.CONSTANT_K_API_KEY || "39facrmt-om2u-4al5-5k4h-g8pls2y5vhui";

function generateAddress(index) {
  const buf = Buffer.alloc(32);
  buf.writeUInt32BE(index, 0);
  return bs58.encode(buf);
}

async function runTest(count) {
  const client = new Client(ENDPOINT, API_KEY);
  const addresses = Array.from({ length: count }, (_, i) => generateAddress(i + 1));

  const filters = {
    client: {
      accountInclude: addresses,
      accountExclude: [],
      accountRequired: [],
      vote: false,
      failed: false,
    },
  };

  console.log(`\n🔬 Testing subscribeOnce with ${count} accountInclude filters...`);
  try {
    const stream = await client.subscribeOnce(
      {}, // accounts
      {}, // slots
      filters, // transactions
      {}, // transactionStatus
      {}, // entries
      {}, // blocks
      {}, // blocksMeta
      CommitmentLevel.CONFIRMED,
      []
    );

    console.log(`✅ Success: stream opened with ${count} filters`);
    stream.on("data", () => {});
    stream.on("error", (err) => {
      console.error(`⚠️ Stream error (${count} filters):`, err.message || err);
    });

    setTimeout(() => {
      stream.end();
      console.log(`⏹️ Closed stream with ${count} filters`);
    }, 3000);
  } catch (error) {
    console.error(`❌ Failed for ${count} filters:`, error.message || error);
  }
}

async function main() {
  console.log("🚀 Constant K accountInclude stress test");
  console.log(`Endpoint: ${ENDPOINT}`);
  console.log(`API Key: ${API_KEY.substring(0, 6)}...`);

  const counts = [100, 150, 200, 240];
  for (const count of counts) {
    await runTest(count);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  console.log("\n✅ Test sequence completed");
}

main().catch((err) => {
  console.error("❌ Unexpected error:", err);
});


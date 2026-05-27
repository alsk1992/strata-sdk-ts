# @strata/sdk

**TypeScript SDK for [Strata](https://strata.exchange).** Account decoders, instruction builders, PDA derivers, WebSocket clients.

This is **not a market-maker bot**. It's the primitives you need to build one in TypeScript / Node.js, or wire a custom trading UI into Strata. For a full Rust reference MM bot, see [`strata-mm-kit`](https://github.com/alsk1992/strata-mm-kit).

## Install

```bash
npm install @strata/sdk @solana/web3.js
# or
pnpm add @strata/sdk @solana/web3.js
```

## Quick start — post an MM intent

```ts
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  findIntentRecordPda,
  findUserAccountPda,
  postIntentIx,
  Side,
} from "@strata/sdk";

const conn = new Connection("https://api.devnet.solana.com");
const programId = new PublicKey("<STRATA_PROGRAM_ID>");
const market = new PublicKey("<MARKET_PDA>");
const mm = Keypair.fromSecretKey(/* ... */);

const [intentPda] = findIntentRecordPda(programId, market, mm.publicKey);
const [uaPda] = findUserAccountPda(programId, market, mm.publicKey);

const ix = postIntentIx(
  { programId, mm: mm.publicKey, market, intentRecord: intentPda, mmUserAccount: uaPda },
  Side.Buy,
  /* minPrice */ 0n,
  /* maxPrice */ 149_870_000n,
  /* maxFillSize */ 50_000_000n,
);

await sendAndConfirmTransaction(conn, new Transaction().add(ix), [mm]);
```

## Quick start — subscribe to the order-book feed

```ts
import { BookFeedClient } from "@strata/sdk";
import WebSocket from "ws"; // Node only — browsers use the global

const client = new BookFeedClient({
  baseUrl: "wss://strata.exchange",
  WebSocketCtor: WebSocket as never,
});

client.on("message", (msg) => {
  if (msg.kind === "Fill") console.log(`fill ${msg.fill_size} @ ${msg.price}`);
});
client.start();
```

## Module map

| Module | What it gives you |
| ------ | ----------------- |
| `pdas` | PDA derivers: `findUserAccountPda`, `findIntentRecordPda`, `findMarketPda`, `findOrderPda`, `findProtocolVaultPda`, `findAta` |
| `ix` | Ix builders: `postIntentIx`, `revokeIntentIx`, `placeOrderIx`, `cancelOrderIx`, `depositIx`, `withdrawIx`, `initUserAccountIx`, `pauseIx`, `unpauseIx` |
| `decode` | Account decoders: `decodeUserAccount`, `decodeIntentRecord`, `decodeMarket`, `decodeProtocolVault` |
| `types` | `FeedMessage`, `MmFeedMessage`, `AvlDensityLevel`, `OrderBookLevel`, `depthTotal()` helper |
| `ws/feed` | `MmFeedClient` — auth'd subscriber to `/ws/mm/{pubkey}` with handshake + reconnect |
| `ws/book` | `BookFeedClient` — public subscriber to `/ws/feed` for market events |
| `constants` | `IxTag`, `AccountKind`, `Side`, `OrderType`, account-size constants |

## Multi-market by default

Every helper takes `programId` + (where relevant) `market` as explicit arguments. No env coupling, no global state. The SDK works across markets and clusters in a single process — useful for cross-market arb, dashboards, indexers.

## Layout sync with the on-chain program

Account layouts in `decode.ts` mirror `crates/strata-types/src/lib.rs` byte-for-byte. **If the on-chain program migrates** (e.g. IntentRecord v2 → v3), the offsets here MUST be updated in lockstep — otherwise decoded fields will be garbage. Version-tagged sizes live in `constants.ts` (`INTENT_RECORD_SIZE`, `MARKET_SIZE`, …).

## Browser + Node

- **Browser**: uses the global `WebSocket`. No extra deps.
- **Node ≥ 18**: pass `WebSocketCtor: WebSocket` from the `ws` package.

## License

MIT OR Apache-2.0

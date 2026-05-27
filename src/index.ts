/**
 * @strata/sdk — TypeScript SDK for Strata.
 *
 * Re-exports the public surface: constants, PDA derivers, ix builders,
 * account decoders, WS clients, wire types.
 *
 * NOT a market-maker bot — that's `strata-mm-kit` (Rust). This SDK
 * gives you the primitives to build your own MM, trading UI, or
 * data pipeline in TypeScript/Node.js.
 */

export * from "./constants.js";
export * from "./pdas.js";
export * from "./ix.js";
export * from "./admin.js";
export * from "./vault.js";
export * from "./decode.js";
export * from "./types.js";
export * from "./tx.js";
export * from "./rest.js";
export * from "./pyth.js";
export { MmFeedClient, type MmFeedClientOptions, type SignChallenge } from "./ws/feed.js";
export { BookFeedClient, type BookFeedClientOptions } from "./ws/book.js";

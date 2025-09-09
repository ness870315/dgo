/**
 * @lami/x-client-transaction-id
 *
 * A library for generating client transaction IDs required for
 * authenticated API requests to X (formerly Twitter).
 *
 * This module exports the main ClientTransaction class and utility functions
 * needed to generate valid x-client-transaction-id headers for X API requests.
 *
 * @module
 */
import ClientTransaction from "./transaction.js";
import Cubic from "./cubic.js";
import { interpolate, interpolateNum } from "./interpolate.js";
import { convertRotationToMatrix } from "./rotation.js";
import { handleXMigration, floatToHex, isOdd } from "./utils.js";
import { encodeBase64, decodeBase64 } from "./deps/jsr.io/@std/encoding/1.0.10/mod.js";
export { ClientTransaction, Cubic, interpolate, interpolateNum, convertRotationToMatrix, handleXMigration, floatToHex, isOdd, encodeBase64, decodeBase64, };
export default ClientTransaction;
//# sourceMappingURL=mod.d.ts.map
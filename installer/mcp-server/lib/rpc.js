import { createPublicClient, http } from "viem";
import { ACTIVE_CHAIN, RPC_URL } from "./constants.js";

let _client;

export function getPublicClient() {
  if (!_client) {
    _client = createPublicClient({
      chain: ACTIVE_CHAIN,
      transport: http(RPC_URL),
    });
  }
  return _client;
}

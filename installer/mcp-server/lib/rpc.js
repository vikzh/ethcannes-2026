import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { BASE_RPC_URL } from "./constants.js";

let _client;

export function getPublicClient() {
  if (!_client) {
    _client = createPublicClient({
      chain: base,
      transport: http(BASE_RPC_URL),
    });
  }
  return _client;
}

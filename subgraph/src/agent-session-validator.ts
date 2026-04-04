import {
  SessionCreated as SessionCreatedEvent,
  SessionRevoked as SessionRevokedEvent,
} from "../generated/templates/AgentSessionValidator/AgentSessionValidator";
import { AgentSession } from "../generated/schema";
import { BigInt } from "@graphprotocol/graph-ts";

// One AgentSession entity per account — the current session overwrites the previous.
// The id is the account address so lookups are O(1) from the UI.

export function handleSessionCreated(event: SessionCreatedEvent): void {
  const id = event.params.account.toHexString();

  let session = AgentSession.load(id);
  if (session == null) {
    session = new AgentSession(id);
    session.account = event.params.account;
    session.createdAtBlock = event.block.number;
    session.createdAtTimestamp = event.block.timestamp;
    session.createdTxHash = event.transaction.hash;
  } else {
    // New session overwrites previous — update creation timestamps for the new session.
    session.createdAtBlock = event.block.number;
    session.createdAtTimestamp = event.block.timestamp;
    session.createdTxHash = event.transaction.hash;
  }

  session.agentKey = event.params.agentKey;
  session.validAfter = event.params.validAfter;
  session.validUntil = event.params.validUntil;
  session.nonce = event.params.nonce;
  session.revoked = false;
  session.updatedAtBlock = event.block.number;
  session.updatedAtTimestamp = event.block.timestamp;
  session.updatedTxHash = event.transaction.hash;
  session.save();
}

export function handleSessionRevoked(event: SessionRevokedEvent): void {
  const id = event.params.account.toHexString();

  let session = AgentSession.load(id);
  if (session == null) {
    // Defensive: create a minimal revoked record if we somehow missed SessionCreated.
    session = new AgentSession(id);
    session.account = event.params.account;
    session.agentKey = event.address; // unknown — use contract address as placeholder
    session.validAfter = BigInt.fromI32(0);
    session.validUntil = BigInt.fromI32(0);
    session.nonce = event.params.nonce;
    session.createdAtBlock = event.block.number;
    session.createdAtTimestamp = event.block.timestamp;
    session.createdTxHash = event.transaction.hash;
  }

  session.revoked = true;
  session.updatedAtBlock = event.block.number;
  session.updatedAtTimestamp = event.block.timestamp;
  session.updatedTxHash = event.transaction.hash;
  session.save();
}

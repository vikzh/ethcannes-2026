import {
  WhitelistApproved as WhitelistApprovedEvent,
  WhitelistRejected as WhitelistRejectedEvent,
  WhitelistRequested as WhitelistRequestedEvent,
  WhitelistRequestCancelled as WhitelistRequestCancelledEvent,
} from "../generated/WhitelistRequestModule/WhitelistRequestModule";
import { WhitelistRequest } from "../generated/schema";
import { BigInt, Bytes } from "@graphprotocol/graph-ts";

function requestEntityId(account: Bytes, requestId: BigInt): string {
  return account.toHexString() + "-" + requestId.toString();
}

export function handleWhitelistRequested(event: WhitelistRequestedEvent): void {
  const id = requestEntityId(event.params.account, event.params.requestId);
  const entity = new WhitelistRequest(id);
  entity.account = event.params.account;
  entity.requestId = event.params.requestId;
  entity.target = event.params.target;
  entity.selector = event.params.selector;
  entity.metadata = event.params.metadata;
  entity.status = "Pending";
  entity.createdAt = event.block.timestamp;
  entity.updatedAt = event.block.timestamp;
  entity.createdTxHash = event.transaction.hash;
  entity.updatedTxHash = event.transaction.hash;
  entity.save();
}

export function handleWhitelistApproved(event: WhitelistApprovedEvent): void {
  const id = requestEntityId(event.params.account, event.params.requestId);
  let entity = WhitelistRequest.load(id);
  if (entity == null) {
    entity = new WhitelistRequest(id);
    entity.account = event.params.account;
    entity.requestId = event.params.requestId;
    entity.target = event.params.target;
    entity.selector = event.params.selector;
    entity.metadata = "";
    entity.createdAt = event.block.timestamp;
    entity.createdTxHash = event.transaction.hash;
  }
  entity.status = "Approved";
  entity.target = event.params.target;
  entity.selector = event.params.selector;
  entity.updatedAt = event.block.timestamp;
  entity.updatedTxHash = event.transaction.hash;
  entity.save();
}

export function handleWhitelistRejected(event: WhitelistRejectedEvent): void {
  const id = requestEntityId(event.params.account, event.params.requestId);
  let entity = WhitelistRequest.load(id);
  if (entity == null) {
    entity = new WhitelistRequest(id);
    entity.account = event.params.account;
    entity.requestId = event.params.requestId;
    entity.target = Bytes.empty();
    entity.selector = Bytes.empty();
    entity.metadata = "";
    entity.createdAt = event.block.timestamp;
    entity.createdTxHash = event.transaction.hash;
  }
  entity.status = "Rejected";
  entity.updatedAt = event.block.timestamp;
  entity.updatedTxHash = event.transaction.hash;
  entity.save();
}

export function handleWhitelistRequestCancelled(event: WhitelistRequestCancelledEvent): void {
  const id = requestEntityId(event.params.account, event.params.requestId);
  let entity = WhitelistRequest.load(id);
  if (entity == null) {
    entity = new WhitelistRequest(id);
    entity.account = event.params.account;
    entity.requestId = event.params.requestId;
    entity.target = Bytes.empty();
    entity.selector = Bytes.empty();
    entity.metadata = "";
    entity.createdAt = event.block.timestamp;
    entity.createdTxHash = event.transaction.hash;
  }
  entity.status = "Cancelled";
  entity.updatedAt = event.block.timestamp;
  entity.updatedTxHash = event.transaction.hash;
  entity.save();
}

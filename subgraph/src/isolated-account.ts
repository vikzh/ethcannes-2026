import {
  AgentSessionValidatorSet as AgentSessionValidatorSetEvent,
  Executed as ExecutedEvent,
  ExecutionEnvelope as ExecutionEnvelopeEvent,
  OwnershipTransferred as OwnershipTransferredEvent,
  PolicyHookSet as PolicyHookSetEvent,
} from "../generated/templates/IsolatedAccount/IsolatedAccount";
import {
  AgentSessionValidator as AgentSessionValidatorTemplate,
} from "../generated/templates";
import { Account, ExecutionCall, ExecutionEnvelope } from "../generated/schema";
import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts";

function getOrCreateAccount(accountId: string, owner: Address): Account {
  let account = Account.load(accountId);
  if (account == null) {
    account = new Account(accountId);
    account.owner = owner;
    account.deployedAtBlock = BigInt.fromI32(0);
    account.deployedAtTimestamp = BigInt.fromI32(0);
    account.deployedTxHash = Bytes.empty();
    account.createdBy = owner;
    account.updatedAtBlock = BigInt.fromI32(0);
    account.updatedAtTimestamp = BigInt.fromI32(0);
  }
  return account as Account;
}

export function handleOwnershipTransferred(event: OwnershipTransferredEvent): void {
  const accountId = event.address.toHexString();
  const account = getOrCreateAccount(accountId, event.params.newOwner);
  account.owner = event.params.newOwner;
  account.updatedAtBlock = event.block.number;
  account.updatedAtTimestamp = event.block.timestamp;
  account.save();
}

export function handlePolicyHookSet(event: PolicyHookSetEvent): void {
  const accountId = event.address.toHexString();
  const account = getOrCreateAccount(accountId, event.address);
  account.policyHook = event.params.policyHook;
  account.updatedAtBlock = event.block.number;
  account.updatedAtTimestamp = event.block.timestamp;
  account.save();

}

export function handleAgentSessionValidatorSet(event: AgentSessionValidatorSetEvent): void {
  const accountId = event.address.toHexString();
  const account = getOrCreateAccount(accountId, event.address);
  account.agentSessionValidator = event.params.validator;
  account.updatedAtBlock = event.block.number;
  account.updatedAtTimestamp = event.block.timestamp;
  account.save();

  // Start indexing events from the agent session validator contract.
  AgentSessionValidatorTemplate.create(event.params.validator);
}

export function handleExecutionEnvelope(event: ExecutionEnvelopeEvent): void {
  const id = event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  const envelope = new ExecutionEnvelope(id);
  envelope.account = event.params.account;
  envelope.signer = event.params.signer;
  envelope.caller = event.params.caller;
  envelope.nonce = event.params.nonce;
  envelope.mode = event.params.mode;
  envelope.deadline = event.params.deadline;
  envelope.executionHash = event.params.executionHash;
  envelope.callCount = event.params.callCount;
  envelope.policyChecked = event.params.policyChecked;
  envelope.blockNumber = event.block.number;
  envelope.timestamp = event.block.timestamp;
  envelope.txHash = event.transaction.hash;
  envelope.save();
}

export function handleExecuted(event: ExecutedEvent): void {
  const id = event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  const call = new ExecutionCall(id);
  call.account = event.address;
  call.target = event.params.target;
  call.value = event.params.value;
  call.selector = event.params.selector;
  call.nonce = event.params.nonce;
  call.executionHash = event.params.executionHash;
  call.callIndex = event.params.callIndex;
  call.blockNumber = event.block.number;
  call.timestamp = event.block.timestamp;
  call.txHash = event.transaction.hash;
  call.save();
}

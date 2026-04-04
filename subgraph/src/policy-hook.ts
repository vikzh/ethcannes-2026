import {
  WhitelistEntryAdded as WhitelistEntryAddedEvent,
  WhitelistEntryRemoved as WhitelistEntryRemovedEvent,
  SpendLimitSet as SpendLimitSetEvent,
  SpendLimitRemoved as SpendLimitRemovedEvent,
  NativeValueCapSet as NativeValueCapSetEvent,
  AccountPaused as AccountPausedEvent,
  AccountUnpaused as AccountUnpausedEvent,
  EqRuleAdded as EqRuleAddedEvent,
  EqRuleRemoved as EqRuleRemovedEvent,
  RuleSpendLimitSet as RuleSpendLimitSetEvent,
} from "../generated/PolicyHookRuleSpend/PolicyHookRuleSpend";
import {
  WhitelistEntry,
  GlobalSpendLimit,
  PolicyRule,
  PolicyConfig,
} from "../generated/schema";
import { BigInt, Bytes } from "@graphprotocol/graph-ts";

// ---------------------------------------------------------------------------
// ID helpers
// ---------------------------------------------------------------------------

function whitelistEntryId(account: Bytes, target: Bytes, selector: Bytes): string {
  return account.toHexString() + "-" + target.toHexString() + "-" + selector.toHexString();
}

function spendLimitId(account: Bytes, token: Bytes): string {
  return account.toHexString() + "-" + token.toHexString();
}

function policyRuleId(account: Bytes, ruleId: Bytes): string {
  return account.toHexString() + "-" + ruleId.toHexString();
}

function policyConfigId(account: Bytes): string {
  return account.toHexString();
}

// ---------------------------------------------------------------------------
// PolicyConfig helpers
// ---------------------------------------------------------------------------

function getOrCreatePolicyConfig(account: Bytes, block: BigInt, timestamp: BigInt, txHash: Bytes): PolicyConfig {
  const id = policyConfigId(account);
  let config = PolicyConfig.load(id);
  if (config == null) {
    config = new PolicyConfig(id);
    config.account = account;
    config.nativeValueCap = BigInt.fromI32(0);
    config.paused = false;
    config.updatedAtBlock = block;
    config.updatedAtTimestamp = timestamp;
    config.updatedTxHash = txHash;
  }
  return config as PolicyConfig;
}

// ---------------------------------------------------------------------------
// Whitelist entry handlers
// ---------------------------------------------------------------------------

export function handleWhitelistEntryAdded(event: WhitelistEntryAddedEvent): void {
  const id = whitelistEntryId(
    event.params.account,
    event.params.target,
    event.params.selector
  );

  let entry = WhitelistEntry.load(id);
  if (entry == null) {
    entry = new WhitelistEntry(id);
    entry.account = event.params.account;
    entry.target = event.params.target;
    entry.selector = event.params.selector;
    entry.addedAtBlock = event.block.number;
    entry.addedAtTimestamp = event.block.timestamp;
    entry.addedTxHash = event.transaction.hash;
  }

  entry.active = true;
  entry.updatedAtBlock = event.block.number;
  entry.updatedAtTimestamp = event.block.timestamp;
  entry.updatedTxHash = event.transaction.hash;
  entry.save();
}

export function handleWhitelistEntryRemoved(event: WhitelistEntryRemovedEvent): void {
  const id = whitelistEntryId(
    event.params.account,
    event.params.target,
    event.params.selector
  );

  let entry = WhitelistEntry.load(id);
  if (entry == null) {
    // Defensive: create a tombstone if somehow we missed the add event.
    entry = new WhitelistEntry(id);
    entry.account = event.params.account;
    entry.target = event.params.target;
    entry.selector = event.params.selector;
    entry.addedAtBlock = event.block.number;
    entry.addedAtTimestamp = event.block.timestamp;
    entry.addedTxHash = event.transaction.hash;
  }

  entry.active = false;
  entry.updatedAtBlock = event.block.number;
  entry.updatedAtTimestamp = event.block.timestamp;
  entry.updatedTxHash = event.transaction.hash;
  entry.save();
}

// ---------------------------------------------------------------------------
// Global spend limit handlers
// ---------------------------------------------------------------------------

export function handleSpendLimitSet(event: SpendLimitSetEvent): void {
  const id = spendLimitId(event.params.account, event.params.token);

  let limit = GlobalSpendLimit.load(id);
  if (limit == null) {
    limit = new GlobalSpendLimit(id);
    limit.account = event.params.account;
    limit.token = event.params.token;
    limit.setAtBlock = event.block.number;
    limit.setAtTimestamp = event.block.timestamp;
    limit.setTxHash = event.transaction.hash;
  }

  limit.maxPerPeriod = event.params.maxPerPeriod;
  limit.periodDuration = event.params.periodDuration;
  limit.active = true;
  limit.updatedAtBlock = event.block.number;
  limit.updatedAtTimestamp = event.block.timestamp;
  limit.updatedTxHash = event.transaction.hash;
  limit.save();
}

export function handleSpendLimitRemoved(event: SpendLimitRemovedEvent): void {
  const id = spendLimitId(event.params.account, event.params.token);

  let limit = GlobalSpendLimit.load(id);
  if (limit == null) {
    limit = new GlobalSpendLimit(id);
    limit.account = event.params.account;
    limit.token = event.params.token;
    limit.maxPerPeriod = BigInt.fromI32(0);
    limit.periodDuration = BigInt.fromI32(0);
    limit.setAtBlock = event.block.number;
    limit.setAtTimestamp = event.block.timestamp;
    limit.setTxHash = event.transaction.hash;
  }

  limit.active = false;
  limit.updatedAtBlock = event.block.number;
  limit.updatedAtTimestamp = event.block.timestamp;
  limit.updatedTxHash = event.transaction.hash;
  limit.save();
}

// ---------------------------------------------------------------------------
// PolicyConfig handlers
// ---------------------------------------------------------------------------

export function handleNativeValueCapSet(event: NativeValueCapSetEvent): void {
  const config = getOrCreatePolicyConfig(
    event.params.account,
    event.block.number,
    event.block.timestamp,
    event.transaction.hash
  );
  config.nativeValueCap = event.params.cap;
  config.updatedAtBlock = event.block.number;
  config.updatedAtTimestamp = event.block.timestamp;
  config.updatedTxHash = event.transaction.hash;
  config.save();
}

export function handleAccountPaused(event: AccountPausedEvent): void {
  const config = getOrCreatePolicyConfig(
    event.params.account,
    event.block.number,
    event.block.timestamp,
    event.transaction.hash
  );
  config.paused = true;
  config.updatedAtBlock = event.block.number;
  config.updatedAtTimestamp = event.block.timestamp;
  config.updatedTxHash = event.transaction.hash;
  config.save();
}

export function handleAccountUnpaused(event: AccountUnpausedEvent): void {
  const config = getOrCreatePolicyConfig(
    event.params.account,
    event.block.number,
    event.block.timestamp,
    event.transaction.hash
  );
  config.paused = false;
  config.updatedAtBlock = event.block.number;
  config.updatedAtTimestamp = event.block.timestamp;
  config.updatedTxHash = event.transaction.hash;
  config.save();
}

// ---------------------------------------------------------------------------
// Policy rule handlers
// ---------------------------------------------------------------------------

export function handleEqRuleAdded(event: EqRuleAddedEvent): void {
  const id = policyRuleId(event.params.account, event.params.ruleId);

  let rule = PolicyRule.load(id);
  if (rule == null) {
    rule = new PolicyRule(id);
    rule.account = event.params.account;
    rule.ruleId = event.params.ruleId;
    rule.addedAtBlock = event.block.number;
    rule.addedAtTimestamp = event.block.timestamp;
    rule.addedTxHash = event.transaction.hash;
    // Spend defaults — will be overwritten by RuleSpendLimitSet if emitted.
    rule.spendParamIndex = 255; // SPEND_DISABLED
    rule.maxPerPeriod = BigInt.fromI32(0);
    rule.periodDuration = BigInt.fromI32(0);
  }

  rule.target = event.params.target;
  rule.selector = event.params.selector;
  rule.active = true;
  rule.updatedAtBlock = event.block.number;
  rule.updatedAtTimestamp = event.block.timestamp;
  rule.updatedTxHash = event.transaction.hash;
  rule.save();
}

export function handleEqRuleRemoved(event: EqRuleRemovedEvent): void {
  const id = policyRuleId(event.params.account, event.params.ruleId);

  let rule = PolicyRule.load(id);
  if (rule == null) {
    // Defensive tombstone.
    rule = new PolicyRule(id);
    rule.account = event.params.account;
    rule.ruleId = event.params.ruleId;
    rule.target = Bytes.empty();
    rule.selector = Bytes.empty();
    rule.spendParamIndex = 255;
    rule.maxPerPeriod = BigInt.fromI32(0);
    rule.periodDuration = BigInt.fromI32(0);
    rule.addedAtBlock = event.block.number;
    rule.addedAtTimestamp = event.block.timestamp;
    rule.addedTxHash = event.transaction.hash;
  }

  rule.active = false;
  rule.updatedAtBlock = event.block.number;
  rule.updatedAtTimestamp = event.block.timestamp;
  rule.updatedTxHash = event.transaction.hash;
  rule.save();
}

// RuleSpendLimitSet fires alongside EqRuleAdded when a rule has spend tracking.
// EqRuleAdded always fires first, so the entity should already exist.
export function handleRuleSpendLimitSet(event: RuleSpendLimitSetEvent): void {
  const id = policyRuleId(event.params.account, event.params.ruleId);

  let rule = PolicyRule.load(id);
  if (rule == null) {
    // Defensive: create if somehow EqRuleAdded was missed.
    rule = new PolicyRule(id);
    rule.account = event.params.account;
    rule.ruleId = event.params.ruleId;
    rule.target = Bytes.empty();
    rule.selector = Bytes.empty();
    rule.active = true;
    rule.addedAtBlock = event.block.number;
    rule.addedAtTimestamp = event.block.timestamp;
    rule.addedTxHash = event.transaction.hash;
  }

  rule.spendParamIndex = event.params.spendParamIndex;
  rule.maxPerPeriod = event.params.maxPerPeriod;
  rule.periodDuration = event.params.periodDuration;
  rule.updatedAtBlock = event.block.number;
  rule.updatedAtTimestamp = event.block.timestamp;
  rule.updatedTxHash = event.transaction.hash;
  rule.save();
}

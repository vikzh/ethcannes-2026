import { expect } from "chai";
import { ethers } from "hardhat";

const EXECUTE_SELECTOR = ethers.id("execute(bytes32,bytes)").slice(0, 10);

const CALLTYPE_SINGLE = "0x00";
const CALLTYPE_DELEGATECALL = "0xFF";

const TRANSFER_SELECTOR = ethers.id("transfer(address,uint256)").slice(0, 10) as `0x${string}`;
const APPROVE_SELECTOR = ethers.id("approve(address,uint256)").slice(0, 10) as `0x${string}`;

function buildMode(callType: string): string {
  return callType + "00".repeat(31);
}

function encodeSingle(target: string, value: bigint, callData: string): string {
  return ethers.solidityPacked(["address", "uint256", "bytes"], [target, value, callData]);
}

function buildMsgData(mode: string, executionCalldata: string): string {
  const params = ethers.AbiCoder.defaultAbiCoder().encode(["bytes32", "bytes"], [mode, executionCalldata]);
  return EXECUTE_SELECTOR + params.slice(2);
}

function abiWordAddress(value: string): string {
  return ethers.AbiCoder.defaultAbiCoder().encode(["address"], [value]);
}

function abiWordUint(value: bigint): string {
  return ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [value]);
}

async function deployHook(nativeCapWei = 0n) {
  const hook = await (await ethers.getContractFactory("PolicyHookEq")).deploy();
  const initData =
    nativeCapWei > 0n
      ? ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [nativeCapWei])
      : "0x";
  await hook.onInstall(initData);
  return hook;
}

describe("PolicyHookEq", () => {
  let hook: any;
  let token: any;
  let tokenAddr: string;
  let accountAddr: string;
  let recipientA: string;
  let recipientB: string;

  beforeEach(async () => {
    const [account, a, b] = await ethers.getSigners();
    accountAddr = account.address;
    recipientA = a.address;
    recipientB = b.address;

    hook = await deployHook();
    token = await (await ethers.getContractFactory("MockERC20")).deploy();
    tokenAddr = await token.getAddress();
  });

  it("adds, fetches and removes an equality rule", async () => {
    const conditions = [
      { paramIndex: 0, expectedValue: abiWordAddress(recipientA) as `0x${string}` },
      { paramIndex: 1, expectedValue: abiWordUint(123n) as `0x${string}` },
    ];
    const expectedRuleId = await hook.computeEqRuleId(tokenAddr, TRANSFER_SELECTOR, conditions);

    await expect(hook.addEqRule(tokenAddr, TRANSFER_SELECTOR, conditions))
      .to.emit(hook, "EqRuleAdded")
      .withArgs(accountAddr, expectedRuleId, tokenAddr, TRANSFER_SELECTOR);

    expect(await hook.hasEqRules(accountAddr, tokenAddr, TRANSFER_SELECTOR)).to.equal(true);

    const [rule, storedConditions] = await hook.getEqRule(accountAddr, expectedRuleId);
    expect(rule.target).to.equal(tokenAddr);
    expect(rule.selector).to.equal(TRANSFER_SELECTOR);
    expect(rule.active).to.equal(true);
    expect(rule.conditionCount).to.equal(2n);
    expect(storedConditions.length).to.equal(2);

    await expect(hook.removeEqRule(expectedRuleId))
      .to.emit(hook, "EqRuleRemoved")
      .withArgs(accountAddr, expectedRuleId);

    expect(await hook.hasEqRules(accountAddr, tokenAddr, TRANSFER_SELECTOR)).to.equal(false);
  });

  it("reverts on unsorted conditions", async () => {
    const badConditions = [
      { paramIndex: 1, expectedValue: abiWordUint(1n) as `0x${string}` },
      { paramIndex: 0, expectedValue: abiWordAddress(recipientA) as `0x${string}` },
    ];
    await expect(hook.addEqRule(tokenAddr, TRANSFER_SELECTOR, badConditions))
      .to.be.revertedWithCustomError(hook, "EqConditionsUnsorted");
  });

  it("rejects wildcard selector for equality rules", async () => {
    await expect(hook.addEqRule(tokenAddr, "0xffffffff", []))
      .to.be.revertedWithCustomError(hook, "WildcardEqRuleUnsupported");
  });

  it("allows preCheck when calldata matches equality rule", async () => {
    await hook.addEqRule(tokenAddr, TRANSFER_SELECTOR, [
      { paramIndex: 0, expectedValue: abiWordAddress(recipientA) as `0x${string}` },
    ]);

    const callData = token.interface.encodeFunctionData("transfer", [recipientA, 50n]);
    const msgData = buildMsgData(buildMode(CALLTYPE_SINGLE), encodeSingle(tokenAddr, 0n, callData));
    await expect(hook.preCheck(ethers.ZeroAddress, 0n, msgData)).to.not.be.reverted;
  });

  it("enforces ERC20 transfer destination equality", async () => {
    await hook.addEqRule(tokenAddr, TRANSFER_SELECTOR, [
      { paramIndex: 0, expectedValue: abiWordAddress(recipientA) as `0x${string}` },
    ]);

    const allowedCallData = token.interface.encodeFunctionData("transfer", [recipientA, 999n]);
    const allowedMsgData = buildMsgData(buildMode(CALLTYPE_SINGLE), encodeSingle(tokenAddr, 0n, allowedCallData));
    await expect(hook.preCheck(ethers.ZeroAddress, 0n, allowedMsgData)).to.not.be.reverted;

    const blockedCallData = token.interface.encodeFunctionData("transfer", [recipientB, 999n]);
    const blockedMsgData = buildMsgData(buildMode(CALLTYPE_SINGLE), encodeSingle(tokenAddr, 0n, blockedCallData));
    await expect(hook.preCheck(ethers.ZeroAddress, 0n, blockedMsgData))
      .to.be.revertedWithCustomError(hook, "EqRuleNotSatisfied");
  });

  it("reverts with EqRuleNotSatisfied when tuple has rules but calldata does not match", async () => {
    await hook.addEqRule(tokenAddr, TRANSFER_SELECTOR, [
      { paramIndex: 0, expectedValue: abiWordAddress(recipientA) as `0x${string}` },
    ]);

    const callData = token.interface.encodeFunctionData("transfer", [recipientB, 50n]);
    const msgData = buildMsgData(buildMode(CALLTYPE_SINGLE), encodeSingle(tokenAddr, 0n, callData));
    await expect(hook.preCheck(ethers.ZeroAddress, 0n, msgData))
      .to.be.revertedWithCustomError(hook, "EqRuleNotSatisfied");
  });

  it("matches any one of multiple equality rules for the same tuple", async () => {
    await hook.addEqRule(tokenAddr, TRANSFER_SELECTOR, [
      { paramIndex: 0, expectedValue: abiWordAddress(recipientA) as `0x${string}` },
    ]);
    await hook.addEqRule(tokenAddr, TRANSFER_SELECTOR, [
      { paramIndex: 0, expectedValue: abiWordAddress(recipientB) as `0x${string}` },
    ]);

    const callData = token.interface.encodeFunctionData("transfer", [recipientB, 1n]);
    const msgData = buildMsgData(buildMode(CALLTYPE_SINGLE), encodeSingle(tokenAddr, 0n, callData));
    await expect(hook.preCheck(ethers.ZeroAddress, 0n, msgData)).to.not.be.reverted;
  });

  it("falls back to whitelist when no equality rules exist for tuple", async () => {
    await hook.addWhitelistEntry(tokenAddr, APPROVE_SELECTOR);

    const callData = token.interface.encodeFunctionData("approve", [recipientA, 123n]);
    const msgData = buildMsgData(buildMode(CALLTYPE_SINGLE), encodeSingle(tokenAddr, 0n, callData));
    await expect(hook.preCheck(ethers.ZeroAddress, 0n, msgData)).to.not.be.reverted;
  });

  it("blocks delegatecall mode as in base policy", async () => {
    await hook.addWhitelistEntry(tokenAddr, TRANSFER_SELECTOR);
    const callData = token.interface.encodeFunctionData("transfer", [recipientA, 1n]);
    const msgData = buildMsgData(buildMode(CALLTYPE_DELEGATECALL), encodeSingle(tokenAddr, 0n, callData));

    await expect(hook.preCheck(ethers.ZeroAddress, 0n, msgData))
      .to.be.revertedWithCustomError(hook, "DelegatecallBlocked");
  });
});

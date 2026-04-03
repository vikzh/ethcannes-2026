import { expect } from "chai";
import { ethers } from "hardhat";
import { PolicyHook, MockERC20 } from "../../typechain-types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EXECUTE_SELECTOR = ethers.id("execute(bytes32,bytes)").slice(0, 10);

const CALLTYPE_SINGLE       = "0x00";
const CALLTYPE_DELEGATECALL = "0xFF";

function buildMode(callType: string): string {
  // ModeCode layout stores CallType in the first byte.
  return callType + "00".repeat(31);
}

// abi.encodePacked(address target, uint256 value, bytes callData)
function encodeSingle(target: string, value: bigint, callData: string): string {
  return ethers.solidityPacked(
    ["address", "uint256", "bytes"],
    [target, value, callData]
  );
}

// Build raw msgData matching what MockAccount.execute() passes as msg.data to preCheck
function buildMsgData(mode: string, executionCalldata: string): string {
  const params = ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes32", "bytes"],
    [mode, executionCalldata]
  );
  return EXECUTE_SELECTOR + params.slice(2);
}

// Deploy a fresh PolicyHook already initialised under the calling signer (= the "account")
async function deployHook(nativeCapWei = 0n): Promise<PolicyHook> {
  const hook = await (await ethers.getContractFactory("PolicyHook")).deploy();
  const initData =
    nativeCapWei > 0n
      ? ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [nativeCapWei])
      : "0x";
  await hook.onInstall(initData); // msg.sender = test signer = "account"
  return hook;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PolicyHook", () => {
  let target: string;

  const ALLOWED_SELECTOR = "0xdeadbeef";
  const OTHER_SELECTOR   = "0xcafebabe";

  before(async () => {
    target = (await ethers.getSigners())[1].address;
  });

  // -------------------------------------------------------------------------
  // Whitelist management
  // -------------------------------------------------------------------------

  describe("whitelist management", () => {
    let hook: PolicyHook;
    let accountAddr: string;

    beforeEach(async () => {
      const [signer] = await ethers.getSigners();
      accountAddr = signer.address;
      hook = await deployHook();
    });

    it("adds and queries a whitelist entry", async () => {
      await hook.addWhitelistEntry(target, ALLOWED_SELECTOR);

      expect(await hook.isWhitelisted(accountAddr, target, ALLOWED_SELECTOR)).to.be.true;
      expect(await hook.isWhitelisted(accountAddr, target, OTHER_SELECTOR)).to.be.false;
    });

    it("supports wildcard selector (0xffffffff)", async () => {
      await hook.addWhitelistEntry(target, "0xffffffff");

      expect(await hook.isWhitelisted(accountAddr, target, ALLOWED_SELECTOR)).to.be.true;
      expect(await hook.isWhitelisted(accountAddr, target, OTHER_SELECTOR)).to.be.true;
    });

    it("removes a whitelist entry", async () => {
      await hook.addWhitelistEntry(target, ALLOWED_SELECTOR);
      await hook.removeWhitelistEntry(target, ALLOWED_SELECTOR);

      expect(await hook.isWhitelisted(accountAddr, target, ALLOWED_SELECTOR)).to.be.false;
    });

    it("reverts on duplicate entry", async () => {
      await hook.addWhitelistEntry(target, ALLOWED_SELECTOR);
      await expect(hook.addWhitelistEntry(target, ALLOWED_SELECTOR))
        .to.be.revertedWithCustomError(hook, "EntryAlreadyExists");
    });

    it("reverts when removing non-existent entry", async () => {
      await expect(hook.removeWhitelistEntry(target, ALLOWED_SELECTOR))
        .to.be.revertedWithCustomError(hook, "EntryNotFound");
    });
  });

  // -------------------------------------------------------------------------
  // preCheck — single call
  // -------------------------------------------------------------------------

  describe("preCheck (single call)", () => {
    let hook: PolicyHook;

    beforeEach(async () => {
      hook = await deployHook();
      await hook.addWhitelistEntry(target, ALLOWED_SELECTOR);
    });

    it("allows a whitelisted call", async () => {
      const msgData = buildMsgData(
        buildMode(CALLTYPE_SINGLE),
        encodeSingle(target, 0n, ALLOWED_SELECTOR)
      );
      await expect(hook.preCheck(ethers.ZeroAddress, 0n, msgData)).to.not.be.reverted;
    });

    it("reverts for a non-whitelisted call", async () => {
      const msgData = buildMsgData(
        buildMode(CALLTYPE_SINGLE),
        encodeSingle(target, 0n, OTHER_SELECTOR)
      );
      await expect(hook.preCheck(ethers.ZeroAddress, 0n, msgData))
        .to.be.revertedWithCustomError(hook, "NotWhitelisted");
    });

    it("reverts for delegatecall mode", async () => {
      const msgData = buildMsgData(
        buildMode(CALLTYPE_DELEGATECALL),
        encodeSingle(target, 0n, ALLOWED_SELECTOR)
      );
      await expect(hook.preCheck(ethers.ZeroAddress, 0n, msgData))
        .to.be.revertedWithCustomError(hook, "DelegatecallBlocked");
    });

    it("reverts when paused, passes after unpause", async () => {
      const msgData = buildMsgData(
        buildMode(CALLTYPE_SINGLE),
        encodeSingle(target, 0n, ALLOWED_SELECTOR)
      );
      await hook.pause();
      await expect(hook.preCheck(ethers.ZeroAddress, 0n, msgData))
        .to.be.revertedWithCustomError(hook, "PolicyPaused");

      await hook.unpause();
      await expect(hook.preCheck(ethers.ZeroAddress, 0n, msgData)).to.not.be.reverted;
    });

    it("enforces native value cap", async () => {
      const cap  = ethers.parseEther("1");
      const hook2 = await deployHook(cap);
      await hook2.addWhitelistEntry(target, ALLOWED_SELECTOR);

      // Over cap → revert
      const msgDataOver = buildMsgData(
        buildMode(CALLTYPE_SINGLE),
        encodeSingle(target, cap + 1n, ALLOWED_SELECTOR)
      );
      await expect(hook2.preCheck(ethers.ZeroAddress, cap + 1n, msgDataOver))
        .to.be.revertedWithCustomError(hook2, "NativeValueCapExceeded");

      // Exactly at cap → pass
      const msgDataAt = buildMsgData(
        buildMode(CALLTYPE_SINGLE),
        encodeSingle(target, cap, ALLOWED_SELECTOR)
      );
      await expect(hook2.preCheck(ethers.ZeroAddress, cap, msgDataAt)).to.not.be.reverted;
    });

    it("blocks privileged selectors even when whitelisted", async () => {
      const privSel = ethers.id("installModule(uint256,address,bytes)").slice(0, 10);
      await hook.addWhitelistEntry(target, privSel as `0x${string}`);

      const msgData = buildMsgData(
        buildMode(CALLTYPE_SINGLE),
        encodeSingle(target, 0n, privSel + "00".repeat(32))
      );
      await expect(hook.preCheck(ethers.ZeroAddress, 0n, msgData))
        .to.be.revertedWithCustomError(hook, "PrivilegedCallBlocked");
    });
  });

  // -------------------------------------------------------------------------
  // ERC-20 spend limits
  // -------------------------------------------------------------------------

  describe("ERC-20 spend limits", () => {
    let hook: PolicyHook;
    let token: MockERC20;
    let tokenAddr: string;

    const TRANSFER_SEL = ethers.id("transfer(address,uint256)").slice(0, 10);
    const DAY = 86400n;
    const LIMIT = ethers.parseUnits("100", 18);

    beforeEach(async () => {
      token     = await (await ethers.getContractFactory("MockERC20")).deploy();
      tokenAddr = await token.getAddress();
      hook      = await deployHook();

      await hook.addWhitelistEntry(tokenAddr, TRANSFER_SEL as `0x${string}`);
      await hook.setSpendLimit(tokenAddr, LIMIT, DAY);
    });

    it("allows a transfer within the limit", async () => {
      const callData = token.interface.encodeFunctionData("transfer", [target, ethers.parseUnits("50", 18)]);
      const msgData  = buildMsgData(buildMode(CALLTYPE_SINGLE), encodeSingle(tokenAddr, 0n, callData));

      await expect(hook.preCheck(ethers.ZeroAddress, 0n, msgData)).to.not.be.reverted;
    });

    it("reverts when spend exceeds the limit", async () => {
      const callData = token.interface.encodeFunctionData("transfer", [target, ethers.parseUnits("101", 18)]);
      const msgData  = buildMsgData(buildMode(CALLTYPE_SINGLE), encodeSingle(tokenAddr, 0n, callData));

      await expect(hook.preCheck(ethers.ZeroAddress, 0n, msgData))
        .to.be.revertedWithCustomError(hook, "SpendLimitExceeded");
    });

    it("accumulates spend across multiple calls", async () => {
      // Two calls of 60 tokens each — second should exceed the 100 limit
      const callData60 = token.interface.encodeFunctionData("transfer", [target, ethers.parseUnits("60", 18)]);
      const msgData60  = buildMsgData(buildMode(CALLTYPE_SINGLE), encodeSingle(tokenAddr, 0n, callData60));

      await hook.preCheck(ethers.ZeroAddress, 0n, msgData60); // 60 — ok

      await expect(hook.preCheck(ethers.ZeroAddress, 0n, msgData60)) // 60 + 60 > 100
        .to.be.revertedWithCustomError(hook, "SpendLimitExceeded");
    });
  });
});

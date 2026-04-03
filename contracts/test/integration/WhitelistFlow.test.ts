import { expect } from "chai";
import { ethers } from "hardhat";
import {
  PolicyHook,
  WhitelistRequestModule,
  MockAccount,
} from "../../typechain-types";

// ---------------------------------------------------------------------------
// Helpers (duplicated from PolicyHook.test.ts — extract to shared helper later)
// ---------------------------------------------------------------------------

const EXECUTE_SELECTOR = ethers.id("execute(bytes32,bytes)").slice(0, 10);
const CALLTYPE_SINGLE  = "0x00";

function buildMode(callType: string): string {
  // ModeCode layout stores CallType in the first byte.
  return callType + "00".repeat(31);
}

function encodeSingle(target: string, value: bigint, callData: string): string {
  return ethers.solidityPacked(["address", "uint256", "bytes"], [target, value, callData]);
}

function buildMsgData(mode: string, executionCalldata: string): string {
  const params = ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes32", "bytes"],
    [mode, executionCalldata]
  );
  return EXECUTE_SELECTOR + params.slice(2);
}

// ---------------------------------------------------------------------------
// Integration: two-step whitelist request/approval flow
// ---------------------------------------------------------------------------

describe("WhitelistFlow (integration)", () => {
  let hook: PolicyHook;
  let whitelistModule: WhitelistRequestModule;
  let account: MockAccount;

  let targetAddr: string;
  const SELECTOR = "0xdeadbeef";

  beforeEach(async () => {
    const [deployer, targetSigner] = await ethers.getSigners();
    targetAddr = targetSigner.address;

    hook            = await (await ethers.getContractFactory("PolicyHook")).deploy();
    whitelistModule = await (await ethers.getContractFactory("WhitelistRequestModule")).deploy();
    account         = await (await ethers.getContractFactory("MockAccount")).deploy();

    await account.setPolicyHook(await hook.getAddress());

    // Install PolicyHook from account (msg.sender = account contract)
    await account.installModule(await hook.getAddress(), "0x");
    // Install WhitelistRequestModule from account
    await account.installModule(await whitelistModule.getAddress(), "0x");
  });

  it("blocks execution before whitelist entry is added", async () => {
    // Install hook fresh so the account has no whitelist entries
    const hook2 = await (await ethers.getContractFactory("PolicyHook")).deploy();
    await hook2.onInstall("0x"); // called by the test signer (= "account" for this test)

    const callData          = SELECTOR;
    const executionCalldata = encodeSingle(targetAddr, 0n, callData);
    const msgData           = buildMsgData(buildMode(CALLTYPE_SINGLE), executionCalldata);

    await expect(hook2.preCheck(ethers.ZeroAddress, 0n, msgData))
      .to.be.revertedWithCustomError(hook2, "NotWhitelisted");
  });

  it("full flow: request → approve → execution allowed", async () => {
    const [deployer] = await ethers.getSigners();
    const hookAddr    = await hook.getAddress();
    const moduleAddr  = await whitelistModule.getAddress();
    const accountAddr = await account.getAddress();

    // -----------------------------------------------------------------------
    // Step 1: Agent submits a whitelist request.
    // In production the agent calls through the account's execute path.
    // Here we simulate that by calling the module directly as the account
    // (the account IS the msg.sender to all modules).
    //
    // Since account is a contract, we use a direct call in the test to
    // simulate the agent triggering this through the account.
    // -----------------------------------------------------------------------
    // We impersonate the account contract to test the module directly.
    await ethers.provider.send("hardhat_impersonateAccount", [accountAddr]);
    await ethers.provider.send("hardhat_setBalance", [
      accountAddr,
      "0x56BC75E2D63100000", // 100 ETH
    ]);
    const accountSigner = await ethers.getSigner(accountAddr);

    // Agent (acting through the account) requests the whitelist addition.
    await expect(
      whitelistModule
        .connect(accountSigner)
        .requestWhitelistAddition(targetAddr, SELECTOR, "Protocol XYZ — needed for trading")
    )
      .to.emit(whitelistModule, "WhitelistRequested")
      .withArgs(accountAddr, 0n, targetAddr, SELECTOR, "Protocol XYZ — needed for trading");

    const pending = await whitelistModule.getPendingRequests(accountAddr);
    expect(pending.length).to.equal(1);
    expect(pending[0].status).to.equal(0); // Pending

    // -----------------------------------------------------------------------
    // Step 2: Owner approves the request.
    // In production the owner signs a UserOp targeting whitelistModule.approveRequest.
    // Here we simulate by calling as the account directly.
    // -----------------------------------------------------------------------
    await expect(
      whitelistModule
        .connect(accountSigner)
        .approveRequest(0n, hookAddr)
    )
      .to.emit(whitelistModule, "WhitelistApproved")
      .withArgs(accountAddr, 0n, targetAddr, SELECTOR)
      .and.to.emit(hook, "WhitelistEntryAdded")
      .withArgs(accountAddr, targetAddr, SELECTOR);

    const approved = await whitelistModule.getRequest(accountAddr, 0n);
    expect(approved.status).to.equal(1); // Approved

    // -----------------------------------------------------------------------
    // Step 3: The entry is now active — preCheck should allow the call.
    // -----------------------------------------------------------------------
    expect(await hook.isWhitelisted(accountAddr, targetAddr, SELECTOR)).to.be.true;

    const callData          = SELECTOR + "00000000";
    const executionCalldata = encodeSingle(targetAddr, 0n, callData);
    const msgData           = buildMsgData(buildMode(CALLTYPE_SINGLE), executionCalldata);

    await expect(hook.connect(accountSigner).preCheck(ethers.ZeroAddress, 0n, msgData))
      .to.not.be.reverted;

    await ethers.provider.send("hardhat_stopImpersonatingAccount", [accountAddr]);
  });

  it("rejected request does not activate the whitelist entry", async () => {
    const accountAddr = await account.getAddress();

    await ethers.provider.send("hardhat_impersonateAccount", [accountAddr]);
    await ethers.provider.send("hardhat_setBalance", [accountAddr, "0x56BC75E2D63100000"]);
    const accountSigner = await ethers.getSigner(accountAddr);

    await whitelistModule
      .connect(accountSigner)
      .requestWhitelistAddition(targetAddr, SELECTOR, "reason");

    await whitelistModule.connect(accountSigner).rejectRequest(0n);

    const req = await whitelistModule.getRequest(accountAddr, 0n);
    expect(req.status).to.equal(2); // Rejected

    expect(await hook.isWhitelisted(accountAddr, targetAddr, SELECTOR)).to.be.false;

    await ethers.provider.send("hardhat_stopImpersonatingAccount", [accountAddr]);
  });

  it("cancelled request cannot be approved", async () => {
    const accountAddr = await account.getAddress();

    await ethers.provider.send("hardhat_impersonateAccount", [accountAddr]);
    await ethers.provider.send("hardhat_setBalance", [accountAddr, "0x56BC75E2D63100000"]);
    const accountSigner = await ethers.getSigner(accountAddr);
    const hookAddr = await hook.getAddress();

    await whitelistModule
      .connect(accountSigner)
      .requestWhitelistAddition(targetAddr, SELECTOR, "reason");

    await whitelistModule.connect(accountSigner).cancelRequest(0n);

    await expect(
      whitelistModule.connect(accountSigner).approveRequest(0n, hookAddr)
    ).to.be.revertedWithCustomError(whitelistModule, "RequestNotPending");

    await ethers.provider.send("hardhat_stopImpersonatingAccount", [accountAddr]);
  });

  it("duplicate pending request is rejected", async () => {
    const accountAddr = await account.getAddress();

    await ethers.provider.send("hardhat_impersonateAccount", [accountAddr]);
    await ethers.provider.send("hardhat_setBalance", [accountAddr, "0x56BC75E2D63100000"]);
    const accountSigner = await ethers.getSigner(accountAddr);

    await whitelistModule
      .connect(accountSigner)
      .requestWhitelistAddition(targetAddr, SELECTOR, "first");

    await expect(
      whitelistModule
        .connect(accountSigner)
        .requestWhitelistAddition(targetAddr, SELECTOR, "duplicate")
    ).to.be.revertedWithCustomError(whitelistModule, "DuplicatePendingRequest");

    await ethers.provider.send("hardhat_stopImpersonatingAccount", [accountAddr]);
  });
});

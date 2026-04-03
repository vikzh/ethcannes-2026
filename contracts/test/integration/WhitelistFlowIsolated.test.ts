import { expect } from "chai";
import { ethers } from "hardhat";
import {
  AgentSessionValidator,
  IsolatedAccount,
  PolicyHook,
  WhitelistRequestModule,
} from "../../typechain-types";

const CALLTYPE_SINGLE = "0x00";

function buildMode(callType: string): string {
  return callType + "00".repeat(31);
}

function encodeSingle(target: string, value: bigint, callData: string): string {
  return ethers.solidityPacked(["address", "uint256", "bytes"], [target, value, callData]);
}

async function signExecute(
  signer: any,
  account: IsolatedAccount,
  mode: string,
  executionCalldata: string,
  signedNonce: bigint,
  deadline: bigint
): Promise<string> {
  const network = await ethers.provider.getNetwork();
  return signer.signTypedData(
    {
      name: "IsolatedAccount",
      version: "1",
      chainId: network.chainId,
      verifyingContract: account.target as string,
    },
    {
      ExecuteRequest: [
        { name: "mode", type: "bytes32" },
        { name: "executionCalldataHash", type: "bytes32" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    {
      mode,
      executionCalldataHash: ethers.keccak256(executionCalldata),
      nonce: signedNonce,
      deadline,
    }
  );
}

describe("WhitelistFlowIsolated (integration)", () => {
  async function setup() {
    const [owner, agent, targetSigner] = await ethers.getSigners();
    const targetAddr = targetSigner.address;
    const selector = "0xdeadbeef";

    const hook: PolicyHook = await (await ethers.getContractFactory("PolicyHook")).deploy();
    const whitelistModule: WhitelistRequestModule = await (
      await ethers.getContractFactory("WhitelistRequestModule")
    ).deploy();
    const validator: AgentSessionValidator = await (
      await ethers.getContractFactory("AgentSessionValidator")
    ).deploy();
    const account: IsolatedAccount = await (await ethers.getContractFactory("IsolatedAccount")).deploy(
      owner.address,
      await hook.getAddress()
    );

    await account.installModule(await hook.getAddress(), "0x");
    await account.installModule(await whitelistModule.getAddress(), "0x");
    await account.installModule(
      await validator.getAddress(),
      ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint48", "uint48"], [agent.address, 0, 0])
    );
    await account.setAgentSessionValidator(await validator.getAddress());

    // Let agent call request/reject/cancel on the request module.
    const requestSel = whitelistModule.interface.getFunction("requestWhitelistAddition")!.selector;
    const rejectSel = whitelistModule.interface.getFunction("rejectRequest")!.selector;
    const cancelSel = whitelistModule.interface.getFunction("cancelRequest")!.selector;
    for (const allowedSelector of [requestSel, rejectSel, cancelSel]) {
      const allowCall = hook.interface.encodeFunctionData("addWhitelistEntry", [
        await whitelistModule.getAddress(),
        allowedSelector,
      ]);
      await account.execute(
        buildMode(CALLTYPE_SINGLE),
        encodeSingle(await hook.getAddress(), 0n, allowCall)
      );
    }

    return { owner, agent, targetAddr, selector, hook, whitelistModule, validator, account };
  }

  it("full flow with IsolatedAccount: request -> approve -> execution allowed", async () => {
    const { agent, targetAddr, selector, hook, whitelistModule, account } = await setup();

    // Agent execution is blocked before tuple approval.
    const preApproveExec = encodeSingle(targetAddr, 0n, selector + "00000000");
    const sigBlocked = await signExecute(agent, account, buildMode(CALLTYPE_SINGLE), preApproveExec, 0n, 0n);
    await expect(
      account.executeAuthorized(buildMode(CALLTYPE_SINGLE), preApproveExec, 0n, 0n, sigBlocked)
    ).to.be.revertedWithCustomError(hook, "NotWhitelisted");

    // Agent requests new whitelist tuple.
    const requestCall = whitelistModule.interface.encodeFunctionData("requestWhitelistAddition", [
      targetAddr,
      selector,
      "needed for protocol",
    ]);
    const requestExec = encodeSingle(await whitelistModule.getAddress(), 0n, requestCall);
    const sigRequest = await signExecute(agent, account, buildMode(CALLTYPE_SINGLE), requestExec, 0n, 0n);
    await expect(
      account.executeAuthorized(buildMode(CALLTYPE_SINGLE), requestExec, 0n, 0n, sigRequest)
    )
      .to.emit(whitelistModule, "WhitelistRequested")
      .withArgs(await account.getAddress(), 0n, targetAddr, selector, "needed for protocol");

    // Owner approves request through account execute path.
    const approveCall = whitelistModule.interface.encodeFunctionData("approveRequest", [
      0n,
      await hook.getAddress(),
    ]);
    await expect(
      account.execute(
        buildMode(CALLTYPE_SINGLE),
        encodeSingle(await whitelistModule.getAddress(), 0n, approveCall)
      )
    )
      .to.emit(whitelistModule, "WhitelistApproved")
      .withArgs(await account.getAddress(), 0n, targetAddr, selector)
      .and.to.emit(hook, "WhitelistEntryAdded")
      .withArgs(await account.getAddress(), targetAddr, selector);

    // Now agent call is permitted.
    const sigAllowed = await signExecute(agent, account, buildMode(CALLTYPE_SINGLE), preApproveExec, 1n, 0n);
    await expect(
      account.executeAuthorized(buildMode(CALLTYPE_SINGLE), preApproveExec, 1n, 0n, sigAllowed)
    ).to.not.be.reverted;
  });

  it("rejected request does not activate whitelist entry", async () => {
    const { agent, targetAddr, selector, hook, whitelistModule, account } = await setup();

    const requestCall = whitelistModule.interface.encodeFunctionData("requestWhitelistAddition", [
      targetAddr,
      selector,
      "reason",
    ]);
    const requestExec = encodeSingle(await whitelistModule.getAddress(), 0n, requestCall);
    const sigRequest = await signExecute(agent, account, buildMode(CALLTYPE_SINGLE), requestExec, 0n, 0n);
    await account.executeAuthorized(buildMode(CALLTYPE_SINGLE), requestExec, 0n, 0n, sigRequest);

    const rejectCall = whitelistModule.interface.encodeFunctionData("rejectRequest", [0n]);
    const rejectExec = encodeSingle(await whitelistModule.getAddress(), 0n, rejectCall);
    const sigReject = await signExecute(agent, account, buildMode(CALLTYPE_SINGLE), rejectExec, 1n, 0n);
    await account.executeAuthorized(buildMode(CALLTYPE_SINGLE), rejectExec, 1n, 0n, sigReject);

    const req = await whitelistModule.getRequest(await account.getAddress(), 0n);
    expect(req.status).to.equal(2); // Rejected
    expect(await hook.isWhitelisted(await account.getAddress(), targetAddr, selector)).to.be.false;
  });

  it("cancelled request cannot be approved", async () => {
    const { agent, targetAddr, selector, hook, whitelistModule, account } = await setup();

    const requestCall = whitelistModule.interface.encodeFunctionData("requestWhitelistAddition", [
      targetAddr,
      selector,
      "reason",
    ]);
    const requestExec = encodeSingle(await whitelistModule.getAddress(), 0n, requestCall);
    const sigRequest = await signExecute(agent, account, buildMode(CALLTYPE_SINGLE), requestExec, 0n, 0n);
    await account.executeAuthorized(buildMode(CALLTYPE_SINGLE), requestExec, 0n, 0n, sigRequest);

    const cancelCall = whitelistModule.interface.encodeFunctionData("cancelRequest", [0n]);
    const cancelExec = encodeSingle(await whitelistModule.getAddress(), 0n, cancelCall);
    const sigCancel = await signExecute(agent, account, buildMode(CALLTYPE_SINGLE), cancelExec, 1n, 0n);
    await account.executeAuthorized(buildMode(CALLTYPE_SINGLE), cancelExec, 1n, 0n, sigCancel);

    const approveCall = whitelistModule.interface.encodeFunctionData("approveRequest", [
      0n,
      await hook.getAddress(),
    ]);
    await expect(
      account.execute(
        buildMode(CALLTYPE_SINGLE),
        encodeSingle(await whitelistModule.getAddress(), 0n, approveCall)
      )
    ).to.be.revertedWithCustomError(whitelistModule, "RequestNotPending");
  });

  it("duplicate pending request is rejected", async () => {
    const { agent, targetAddr, selector, whitelistModule, account } = await setup();

    const requestCall = whitelistModule.interface.encodeFunctionData("requestWhitelistAddition", [
      targetAddr,
      selector,
      "first",
    ]);
    const requestExec = encodeSingle(await whitelistModule.getAddress(), 0n, requestCall);
    const sig1 = await signExecute(agent, account, buildMode(CALLTYPE_SINGLE), requestExec, 0n, 0n);
    await account.executeAuthorized(buildMode(CALLTYPE_SINGLE), requestExec, 0n, 0n, sig1);

    const dupCall = whitelistModule.interface.encodeFunctionData("requestWhitelistAddition", [
      targetAddr,
      selector,
      "duplicate",
    ]);
    const dupExec = encodeSingle(await whitelistModule.getAddress(), 0n, dupCall);
    const sig2 = await signExecute(agent, account, buildMode(CALLTYPE_SINGLE), dupExec, 1n, 0n);
    await expect(
      account.executeAuthorized(buildMode(CALLTYPE_SINGLE), dupExec, 1n, 0n, sig2)
    ).to.be.revertedWithCustomError(whitelistModule, "DuplicatePendingRequest");
  });
});

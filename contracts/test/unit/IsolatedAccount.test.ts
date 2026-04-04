import { expect } from "chai";
import { ethers } from "hardhat";

const CALLTYPE_SINGLE = "0x00";
const CALLTYPE_BATCH = "0x01";

function buildMode(callType: string): string {
  return callType + "00".repeat(31);
}

function encodeSingle(target: string, value: bigint, callData: string): string {
  return ethers.solidityPacked(["address", "uint256", "bytes"], [target, value, callData]);
}

describe("IsolatedAccount", () => {
  async function signExecute(
    signer: any,
    account: any,
    mode: string,
    executionCalldata: string,
    signedNonce: bigint,
    deadline: bigint,
    chainId?: bigint
  ): Promise<string> {
    const network = await ethers.provider.getNetwork();
    const domain = {
      name: "IsolatedAccount",
      version: "1",
      chainId: chainId ?? network.chainId,
      verifyingContract: account.target as string,
    };
    const types = {
      ExecuteRequest: [
        { name: "mode", type: "bytes32" },
        { name: "executionCalldataHash", type: "bytes32" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    };
    const message = {
      mode,
      executionCalldataHash: ethers.keccak256(executionCalldata),
      nonce: signedNonce,
      deadline,
    };
    return signer.signTypedData(domain, types, message);
  }

  it("executes with valid signature and increments nonce", async () => {
    const [owner] = await ethers.getSigners();
    const account = await (await ethers.getContractFactory("IsolatedAccount")).deploy(
      owner.address,
      ethers.ZeroAddress,
      ethers.ZeroAddress
    );
    const counter = await (await ethers.getContractFactory("MockCounter")).deploy();

    const callData = counter.interface.encodeFunctionData("increment");
    const executionCalldata = encodeSingle(await counter.getAddress(), 0n, callData);
    const sig = await signExecute(owner, account, buildMode(CALLTYPE_SINGLE), executionCalldata, 0n, 0n);

    await expect(
      account.executeAuthorized(
        buildMode(CALLTYPE_SINGLE),
        executionCalldata,
        0n,
        0n,
        sig
      )
    ).to.not.be.reverted;

    expect(await account.nonce()).to.equal(1n);
    expect(await counter.value()).to.equal(1n);
  });

  it("rejects replayed signature with old nonce", async () => {
    const [owner] = await ethers.getSigners();
    const account = await (await ethers.getContractFactory("IsolatedAccount")).deploy(
      owner.address,
      ethers.ZeroAddress,
      ethers.ZeroAddress
    );
    const counter = await (await ethers.getContractFactory("MockCounter")).deploy();

    const callData = counter.interface.encodeFunctionData("increment");
    const executionCalldata = encodeSingle(await counter.getAddress(), 0n, callData);
    const sig = await signExecute(owner, account, buildMode(CALLTYPE_SINGLE), executionCalldata, 0n, 0n);

    await account.executeAuthorized(
      buildMode(CALLTYPE_SINGLE),
      executionCalldata,
      0n,
      0n,
      sig
    );

    await expect(
      account.executeAuthorized(
        buildMode(CALLTYPE_SINGLE),
        executionCalldata,
        0n,
        0n,
        sig
      )
    ).to.be.revertedWithCustomError(account, "InvalidNonce");
  });

  it("rejects expired signatures", async () => {
    const [owner] = await ethers.getSigners();
    const account = await (await ethers.getContractFactory("IsolatedAccount")).deploy(
      owner.address,
      ethers.ZeroAddress,
      ethers.ZeroAddress
    );
    const counter = await (await ethers.getContractFactory("MockCounter")).deploy();

    const callData = counter.interface.encodeFunctionData("increment");
    const now = BigInt((await ethers.provider.getBlock("latest"))!.timestamp);
    const deadline = now + 1n;
    const executionCalldata = encodeSingle(await counter.getAddress(), 0n, callData);
    const sig = await signExecute(
      owner,
      account,
      buildMode(CALLTYPE_SINGLE),
      executionCalldata,
      0n,
      deadline
    );

    await ethers.provider.send("evm_setNextBlockTimestamp", [Number(deadline + 10n)]);
    await ethers.provider.send("evm_mine", []);

    await expect(
      account.executeAuthorized(
        buildMode(CALLTYPE_SINGLE),
        executionCalldata,
        0n,
        deadline,
        sig
      )
    ).to.be.revertedWithCustomError(account, "SignatureExpired");
  });

  it("rejects signatures from non-owner", async () => {
    const [owner, attacker] = await ethers.getSigners();
    const account = await (await ethers.getContractFactory("IsolatedAccount")).deploy(
      owner.address,
      ethers.ZeroAddress,
      ethers.ZeroAddress
    );
    const counter = await (await ethers.getContractFactory("MockCounter")).deploy();

    const callData = counter.interface.encodeFunctionData("increment");
    const executionCalldata = encodeSingle(await counter.getAddress(), 0n, callData);
    const sig = await signExecute(
      attacker,
      account,
      buildMode(CALLTYPE_SINGLE),
      executionCalldata,
      0n,
      0n
    );

    await expect(
      account.executeAuthorized(
        buildMode(CALLTYPE_SINGLE),
        executionCalldata,
        0n,
        0n,
        sig
      )
    ).to.be.revertedWithCustomError(account, "AgentSessionInvalid");
  });

  it("rejects signatures with wrong domain chainId", async () => {
    const [owner] = await ethers.getSigners();
    const account = await (await ethers.getContractFactory("IsolatedAccount")).deploy(
      owner.address,
      ethers.ZeroAddress,
      ethers.ZeroAddress
    );
    const counter = await (await ethers.getContractFactory("MockCounter")).deploy();
    const network = await ethers.provider.getNetwork();

    const callData = counter.interface.encodeFunctionData("increment");
    const executionCalldata = encodeSingle(await counter.getAddress(), 0n, callData);
    const sig = await signExecute(
      owner,
      account,
      buildMode(CALLTYPE_SINGLE),
      executionCalldata,
      0n,
      0n,
      network.chainId + 1n
    );

    await expect(
      account.executeAuthorized(
        buildMode(CALLTYPE_SINGLE),
        executionCalldata,
        0n,
        0n,
        sig
      )
    ).to.be.revertedWithCustomError(account, "AgentSessionInvalid");
  });

  it("supports authorized batch execution", async () => {
    const [owner] = await ethers.getSigners();
    const account = await (await ethers.getContractFactory("IsolatedAccount")).deploy(
      owner.address,
      ethers.ZeroAddress,
      ethers.ZeroAddress
    );
    const counter = await (await ethers.getContractFactory("MockCounter")).deploy();
    const callData = counter.interface.encodeFunctionData("increment");

    const executions = [
      { target: await counter.getAddress(), value: 0n, callData },
      { target: await counter.getAddress(), value: 0n, callData },
    ];
    const executionCalldata = ethers.AbiCoder.defaultAbiCoder().encode(
      ["tuple(address target,uint256 value,bytes callData)[]"],
      [executions]
    );
    const sig = await signExecute(owner, account, buildMode(CALLTYPE_BATCH), executionCalldata, 0n, 0n);

    await expect(
      account.executeAuthorized(buildMode(CALLTYPE_BATCH), executionCalldata, 0n, 0n, sig)
    ).to.not.be.reverted;

    expect(await counter.value()).to.equal(2n);
  });

  it("allows active agent session signer and enforces policy hook", async () => {
    const [owner, agent, targetSigner] = await ethers.getSigners();
    const hook = await (await ethers.getContractFactory("PolicyHook")).deploy();
    const validator = await (await ethers.getContractFactory("AgentSessionValidator")).deploy();
    const account = await (await ethers.getContractFactory("IsolatedAccount")).deploy(
      owner.address,
      await hook.getAddress(),
      ethers.ZeroAddress
    );

    await account.installModule(await hook.getAddress(), "0x");
    await account.installModule(
      await validator.getAddress(),
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint48", "uint48"],
        [agent.address, 0, 0]
      )
    );
    await account.setAgentSessionValidator(await validator.getAddress());

    const selector = "0xdeadbeef";
    const whitelistCall = hook.interface.encodeFunctionData("addWhitelistEntry", [
      targetSigner.address,
      selector,
    ]);
    await account.execute(
      buildMode(CALLTYPE_SINGLE),
      encodeSingle(await hook.getAddress(), 0n, whitelistCall)
    );

    const executionCalldata = encodeSingle(targetSigner.address, 0n, selector + "00".repeat(4));
    const sig = await signExecute(
      agent,
      account,
      buildMode(CALLTYPE_SINGLE),
      executionCalldata,
      0n,
      0n
    );

    await expect(
      account.executeAuthorized(buildMode(CALLTYPE_SINGLE), executionCalldata, 0n, 0n, sig)
    ).to.not.be.reverted;

    const revokeCall = validator.interface.encodeFunctionData("revokeSession");
    await account.execute(
      buildMode(CALLTYPE_SINGLE),
      encodeSingle(await validator.getAddress(), 0n, revokeCall)
    );

    const sig2 = await signExecute(
      agent,
      account,
      buildMode(CALLTYPE_SINGLE),
      executionCalldata,
      1n,
      0n
    );
    await expect(
      account.executeAuthorized(buildMode(CALLTYPE_SINGLE), executionCalldata, 1n, 0n, sig2)
    ).to.be.revertedWithCustomError(account, "AgentSessionInvalid");
  });

  it("allows active agent to execute via proxy entrypoint", async () => {
    const [owner, agent, targetSigner] = await ethers.getSigners();
    const hook = await (await ethers.getContractFactory("PolicyHook")).deploy();
    const validator = await (await ethers.getContractFactory("AgentSessionValidator")).deploy();
    const account = await (await ethers.getContractFactory("IsolatedAccount")).deploy(
      owner.address,
      await hook.getAddress(),
      ethers.ZeroAddress
    );

    await account.installModule(await hook.getAddress(), "0x");
    await account.installModule(
      await validator.getAddress(),
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint48", "uint48"],
        [agent.address, 0, 0]
      )
    );
    await account.setAgentSessionValidator(await validator.getAddress());

    const selector = "0xdeadbeef";
    const executionCalldata = encodeSingle(targetSigner.address, 0n, selector + "00".repeat(4));
    await expect(
      account.connect(agent).executeAsAgent(buildMode(CALLTYPE_SINGLE), executionCalldata)
    ).to.be.revertedWithCustomError(account, "PolicyPreCheckFailed");

    const whitelistCall = hook.interface.encodeFunctionData("addWhitelistEntry", [
      targetSigner.address,
      selector,
    ]);
    await account.execute(
      buildMode(CALLTYPE_SINGLE),
      encodeSingle(await hook.getAddress(), 0n, whitelistCall)
    );

    await expect(
      account.connect(agent).executeAsAgent(buildMode(CALLTYPE_SINGLE), executionCalldata)
    ).to.not.be.reverted;

    const revokeCall = validator.interface.encodeFunctionData("revokeSession");
    await account.execute(
      buildMode(CALLTYPE_SINGLE),
      encodeSingle(await validator.getAddress(), 0n, revokeCall)
    );
    await expect(
      account.connect(agent).executeAsAgent(buildMode(CALLTYPE_SINGLE), executionCalldata)
    ).to.be.revertedWithCustomError(account, "AgentSessionInvalid");
  });

  it("supports whitelist request/approve flow via account-native methods", async () => {
    const [owner, agent, targetSigner] = await ethers.getSigners();
    const hook = await (await ethers.getContractFactory("PolicyHook")).deploy();
    const validator = await (await ethers.getContractFactory("AgentSessionValidator")).deploy();
    const whitelistModule = await (await ethers.getContractFactory("WhitelistRequestModule")).deploy();
    const account = await (await ethers.getContractFactory("IsolatedAccount")).deploy(
      owner.address,
      await hook.getAddress(),
      await whitelistModule.getAddress()
    );

    await account.installModule(await hook.getAddress(), "0x");
    await account.installModule(await whitelistModule.getAddress(), "0x");
    await account.installModule(
      await validator.getAddress(),
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint48", "uint48"],
        [agent.address, 0, 0]
      )
    );
    await account.setAgentSessionValidator(await validator.getAddress());

    const selector = "0xdeadbeef";
    await expect(
      account.connect(agent).requestWhitelistAdditionAsAgent(targetSigner.address, selector, "narrow")
    )
      .to.emit(whitelistModule, "WhitelistRequested")
      .withArgs(await account.getAddress(), 0n, targetSigner.address, selector, "narrow");

    await expect(
      account.connect(agent).approveWhitelistRequestAsOwner(0n)
    ).to.be.revertedWithCustomError(account, "Unauthorized");

    await expect(account.approveWhitelistRequestAsOwner(0n))
      .to.emit(whitelistModule, "WhitelistApproved")
      .withArgs(await account.getAddress(), 0n, targetSigner.address, selector);

    expect(await hook.isWhitelisted(await account.getAddress(), targetSigner.address, selector)).to.equal(true);
  });
});

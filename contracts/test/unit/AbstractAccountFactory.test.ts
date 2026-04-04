import { expect } from "chai";
import { ethers } from "hardhat";

const MODE_SINGLE = "0x00" + "00".repeat(31);
function encodeSingle(target: string, value: bigint, callData: string): string {
  return ethers.solidityPacked(["address", "uint256", "bytes"], [target, value, callData]);
}

describe("AbstractAccountFactory", () => {
  let factory: any;
  let hook: any;
  let agentValidator: any;

  beforeEach(async () => {
    factory = await (await ethers.getContractFactory("AbstractAccountFactory")).deploy();
    hook = await (await ethers.getContractFactory("PolicyHook")).deploy();
    agentValidator = await (await ethers.getContractFactory("AgentSessionValidator")).deploy();
  });

  it("deploys a deterministic account and installs modules", async () => {
    const [owner, agent] = await ethers.getSigners();
    const salt = ethers.keccak256(ethers.toUtf8Bytes("aa-account-1"));
    const predicted = await factory.predictAccountAddress(salt, hook.target as string);

    const modules = [
      {
        module: hook.target as string,
        initData: "0x",
      },
    ];

    await expect(
      factory.deployAccount(salt, hook.target as string, modules, agent.address, ethers.ZeroAddress)
    )
      .to.emit(factory, "AccountDeployed")
      .withArgs(
        predicted,
        owner.address,
        owner.address,
        salt,
        hook.target as string
      );
    const account = await ethers.getContractAt("IsolatedAccount", predicted);
    expect(await account.owner()).to.equal(owner.address);
    expect(await account.policyHook()).to.equal(hook.target as string);
    expect(await hook.isInitialized(predicted)).to.equal(true);
    expect(await factory.getWalletByAgent(agent.address)).to.equal(predicted);
    expect(await factory.getWalletByUser(owner.address)).to.equal(predicted);
    const wallets = await factory.getWalletsByUser(owner.address);
    expect(wallets.length).to.equal(1);
    expect(wallets[0]).to.equal(predicted);
  });

  it("reverts for zero module address", async () => {
    const [, agent] = await ethers.getSigners();
    const salt = ethers.keccak256(ethers.toUtf8Bytes("aa-account-2"));

    await expect(
      factory.deployAccount(
        salt,
        ethers.ZeroAddress,
        [{ module: ethers.ZeroAddress, initData: "0x" }],
        agent.address,
        ethers.ZeroAddress
      )
    ).to.be.revertedWithCustomError(factory, "ZeroModuleAddress");
  });

  it("reverts if agent already has a wallet", async () => {
    const [, agent, otherOwner] = await ethers.getSigners();
    const salt1 = ethers.keccak256(ethers.toUtf8Bytes("aa-account-3"));
    const salt2 = ethers.keccak256(ethers.toUtf8Bytes("aa-account-4"));
    const modules = [{ module: hook.target as string, initData: "0x" }];

    await factory.deployAccount(salt1, hook.target as string, modules, agent.address, ethers.ZeroAddress);
    await expect(
      factory
        .connect(otherOwner)
        .deployAccount(salt2, hook.target as string, modules, agent.address, ethers.ZeroAddress)
    )
      .to.be.revertedWithCustomError(factory, "AgentAlreadyHasWallet");
  });

  it("reverts for zero agent address", async () => {
    const salt = ethers.keccak256(ethers.toUtf8Bytes("aa-account-5"));
    const modules = [{ module: hook.target as string, initData: "0x" }];

    await expect(
      factory.deployAccount(salt, hook.target as string, modules, ethers.ZeroAddress, ethers.ZeroAddress)
    )
      .to.be.revertedWithCustomError(factory, "ZeroAgentAddress");
  });

  it("allows multiple wallets per user and keeps latest in getWalletByUser", async () => {
    const [, agent, otherAgent] = await ethers.getSigners();
    const salt1 = ethers.keccak256(ethers.toUtf8Bytes("aa-account-6"));
    const salt2 = ethers.keccak256(ethers.toUtf8Bytes("aa-account-7"));
    const modules = [{ module: hook.target as string, initData: "0x" }];
    const predicted1 = await factory.predictAccountAddress(salt1, hook.target as string);
    const predicted2 = await factory.predictAccountAddress(salt2, hook.target as string);

    await factory.deployAccount(salt1, hook.target as string, modules, agent.address, ethers.ZeroAddress);
    await expect(
      factory.deployAccount(salt2, hook.target as string, modules, otherAgent.address, ethers.ZeroAddress)
    )
      .to.not.be.reverted;

    const wallets = await factory.getWalletsByUser((await ethers.getSigners())[0].address);
    expect(wallets.length).to.equal(2);
    expect(wallets[0]).to.equal(predicted1);
    expect(wallets[1]).to.equal(predicted2);
    expect(await factory.getWalletByUser((await ethers.getSigners())[0].address)).to.equal(predicted2);
  });

  it("forwards attached ETH to agent wallet on deploy", async () => {
    const [, agent] = await ethers.getSigners();
    const salt = ethers.keccak256(ethers.toUtf8Bytes("aa-account-8"));
    const modules = [{ module: hook.target as string, initData: "0x" }];
    const funding = ethers.parseEther("0.01");
    const before = await ethers.provider.getBalance(agent.address);

    await factory.deployAccount(
      salt,
      hook.target as string,
      modules,
      agent.address,
      ethers.ZeroAddress,
      { value: funding }
    );

    const after = await ethers.provider.getBalance(agent.address);
    expect(after - before).to.equal(funding);
  });

  it("returns wallet address for each agent via getWalletByAgent", async () => {
    const [, agent1, agent2] = await ethers.getSigners();
    const mkModules = (agentAddr: string) => {
      const initData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint48", "uint48"],
        [agentAddr, 0n, 0n]
      );
      return [
        { module: hook.target as string, initData: "0x" },
        { module: agentValidator.target as string, initData },
      ];
    };

    const salt1 = ethers.keccak256(ethers.toUtf8Bytes("aa-account-13"));
    const salt2 = ethers.keccak256(ethers.toUtf8Bytes("aa-account-14"));
    const predicted1 = await factory.predictAccountAddress(salt1, hook.target as string);
    const predicted2 = await factory.predictAccountAddress(salt2, hook.target as string);

    await factory.deployAccount(
      salt1,
      hook.target as string,
      mkModules(agent1.address),
      agent1.address,
      agentValidator.target as string
    );
    await factory.deployAccount(
      salt2,
      hook.target as string,
      mkModules(agent2.address),
      agent2.address,
      agentValidator.target as string
    );

    expect(await factory.getWalletByAgent(agent1.address)).to.equal(predicted1);
    expect(await factory.getWalletByAgent(agent2.address)).to.equal(predicted2);
  });

  it("returns full wallet list for user via getWalletsByUser", async () => {
    const [owner, agent1, agent2] = await ethers.getSigners();
    const mkModules = (agentAddr: string) => {
      const initData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint48", "uint48"],
        [agentAddr, 0n, 0n]
      );
      return [
        { module: hook.target as string, initData: "0x" },
        { module: agentValidator.target as string, initData },
      ];
    };

    const salt1 = ethers.keccak256(ethers.toUtf8Bytes("aa-account-15"));
    const salt2 = ethers.keccak256(ethers.toUtf8Bytes("aa-account-16"));
    const predicted1 = await factory.predictAccountAddress(salt1, hook.target as string);
    const predicted2 = await factory.predictAccountAddress(salt2, hook.target as string);

    await factory.deployAccount(
      salt1,
      hook.target as string,
      mkModules(agent1.address),
      agent1.address,
      agentValidator.target as string
    );
    await factory.deployAccount(
      salt2,
      hook.target as string,
      mkModules(agent2.address),
      agent2.address,
      agentValidator.target as string
    );

    const wallets = await factory.getWalletsByUser(owner.address);
    expect(wallets.length).to.equal(2);
    expect(wallets[0]).to.equal(predicted1);
    expect(wallets[1]).to.equal(predicted2);
    expect(await factory.getWalletByUser(owner.address)).to.equal(predicted2);
  });

  it("sets agent session validator during deploy (no follow-up tx needed)", async () => {
    const [, agent] = await ethers.getSigners();
    const salt = ethers.keccak256(ethers.toUtf8Bytes("aa-account-9"));
    const predicted = await factory.predictAccountAddress(salt, hook.target as string);
    const initData = ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "uint48", "uint48"],
      [agent.address, 0n, 0n]
    );
    const modules = [
      { module: hook.target as string, initData: "0x" },
      { module: agentValidator.target as string, initData },
    ];

    await factory.deployAccount(
      salt,
      hook.target as string,
      modules,
      agent.address,
      agentValidator.target as string
    );

    const account = await ethers.getContractAt("IsolatedAccount", predicted);
    expect(await account.agentSessionValidator()).to.equal(agentValidator.target as string);
  });

  it("syncs factory agent mapping after session rotation", async () => {
    const [owner, agent1, agent2] = await ethers.getSigners();
    const salt = ethers.keccak256(ethers.toUtf8Bytes("aa-account-10"));
    const predicted = await factory.predictAccountAddress(salt, hook.target as string);
    const initData = ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "uint48", "uint48"],
      [agent1.address, 0n, 0n]
    );
    const modules = [
      { module: hook.target as string, initData: "0x" },
      { module: agentValidator.target as string, initData },
    ];

    await factory.deployAccount(
      salt,
      hook.target as string,
      modules,
      agent1.address,
      agentValidator.target as string
    );

    const account = await ethers.getContractAt("IsolatedAccount", predicted, owner);
    expect(await factory.getWalletByAgent(agent1.address)).to.equal(predicted);

    const rotateCall = agentValidator.interface.encodeFunctionData("createSession", [
      agent2.address,
      0n,
      0n,
    ]);
    await account.execute(
      MODE_SINGLE,
      encodeSingle(agentValidator.target as string, 0n, rotateCall)
    );

    expect(await factory.getWalletByAgent(agent1.address)).to.equal(predicted);
    expect(await factory.getWalletByAgent(agent2.address)).to.equal(ethers.ZeroAddress);

    const syncCall = factory.interface.encodeFunctionData("syncAgentWallet");
    await account.execute(
      MODE_SINGLE,
      encodeSingle(await factory.getAddress(), 0n, syncCall)
    );

    expect(await factory.getWalletByAgent(agent1.address)).to.equal(ethers.ZeroAddress);
    expect(await factory.getWalletByAgent(agent2.address)).to.equal(predicted);
    expect(await factory.getAgentByWallet(predicted)).to.equal(agent2.address);
  });

  it("rejects sync when rotated agent is already bound to another wallet", async () => {
    const [owner, agent1, agent2, agent3] = await ethers.getSigners();
    const mkModules = (agentAddr: string) => {
      const initData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint48", "uint48"],
        [agentAddr, 0n, 0n]
      );
      return [
        { module: hook.target as string, initData: "0x" },
        { module: agentValidator.target as string, initData },
      ];
    };

    const saltA = ethers.keccak256(ethers.toUtf8Bytes("aa-account-11"));
    const saltB = ethers.keccak256(ethers.toUtf8Bytes("aa-account-12"));
    const predictedA = await factory.predictAccountAddress(saltA, hook.target as string);

    await factory.deployAccount(
      saltA,
      hook.target as string,
      mkModules(agent1.address),
      agent1.address,
      agentValidator.target as string
    );
    await factory.deployAccount(
      saltB,
      hook.target as string,
      mkModules(agent2.address),
      agent2.address,
      agentValidator.target as string
    );

    const accountA = await ethers.getContractAt("IsolatedAccount", predictedA, owner);
    const rotateCall = agentValidator.interface.encodeFunctionData("createSession", [
      agent2.address,
      0n,
      0n,
    ]);
    await accountA.execute(
      MODE_SINGLE,
      encodeSingle(agentValidator.target as string, 0n, rotateCall)
    );

    const syncCall = factory.interface.encodeFunctionData("syncAgentWallet");
    await expect(
      accountA.execute(
        MODE_SINGLE,
        encodeSingle(await factory.getAddress(), 0n, syncCall)
      )
    ).to.be.revertedWithCustomError(factory, "AgentAlreadyHasWallet");

    // Sanity: no accidental reassignment.
    expect(await factory.getWalletByAgent(agent1.address)).to.equal(predictedA);
    expect(await factory.getWalletByAgent(agent2.address)).to.not.equal(ethers.ZeroAddress);
    expect(await factory.getWalletByAgent(agent3.address)).to.equal(ethers.ZeroAddress);
  });
});

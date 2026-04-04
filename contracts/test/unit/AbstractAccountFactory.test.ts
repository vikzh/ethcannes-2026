import { expect } from "chai";
import { ethers } from "hardhat";

describe("AbstractAccountFactory", () => {
  let factory: any;
  let hook: any;

  beforeEach(async () => {
    factory = await (await ethers.getContractFactory("AbstractAccountFactory")).deploy();
    hook = await (await ethers.getContractFactory("PolicyHook")).deploy();
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

    await expect(factory.deployAccount(salt, hook.target as string, modules, agent.address))
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
        agent.address
      )
    ).to.be.revertedWithCustomError(factory, "ZeroModuleAddress");
  });

  it("reverts if agent already has a wallet", async () => {
    const [, agent, otherOwner] = await ethers.getSigners();
    const salt1 = ethers.keccak256(ethers.toUtf8Bytes("aa-account-3"));
    const salt2 = ethers.keccak256(ethers.toUtf8Bytes("aa-account-4"));
    const modules = [{ module: hook.target as string, initData: "0x" }];

    await factory.deployAccount(salt1, hook.target as string, modules, agent.address);
    await expect(factory.connect(otherOwner).deployAccount(salt2, hook.target as string, modules, agent.address))
      .to.be.revertedWithCustomError(factory, "AgentAlreadyHasWallet");
  });

  it("reverts for zero agent address", async () => {
    const salt = ethers.keccak256(ethers.toUtf8Bytes("aa-account-5"));
    const modules = [{ module: hook.target as string, initData: "0x" }];

    await expect(factory.deployAccount(salt, hook.target as string, modules, ethers.ZeroAddress))
      .to.be.revertedWithCustomError(factory, "ZeroAgentAddress");
  });

  it("allows multiple wallets per user and keeps latest in getWalletByUser", async () => {
    const [, agent, otherAgent] = await ethers.getSigners();
    const salt1 = ethers.keccak256(ethers.toUtf8Bytes("aa-account-6"));
    const salt2 = ethers.keccak256(ethers.toUtf8Bytes("aa-account-7"));
    const modules = [{ module: hook.target as string, initData: "0x" }];
    const predicted1 = await factory.predictAccountAddress(salt1, hook.target as string);
    const predicted2 = await factory.predictAccountAddress(salt2, hook.target as string);

    await factory.deployAccount(salt1, hook.target as string, modules, agent.address);
    await expect(factory.deployAccount(salt2, hook.target as string, modules, otherAgent.address))
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

    await factory.deployAccount(salt, hook.target as string, modules, agent.address, { value: funding });

    const after = await ethers.provider.getBalance(agent.address);
    expect(after - before).to.equal(funding);
  });
});

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
    const salt = ethers.keccak256(ethers.toUtf8Bytes("aa-account-1"));
    const predicted = await factory.predictAccountAddress(salt, hook.target as string);

    const modules = [
      {
        module: hook.target as string,
        initData: "0x",
      },
    ];

    await expect(factory.deployAccount(salt, hook.target as string, modules))
      .to.emit(factory, "AccountDeployed")
      .withArgs(
        predicted,
        (await ethers.getSigners())[0].address,
        (await ethers.getSigners())[0].address,
        salt,
        hook.target as string
      );

    const account = await ethers.getContractAt("IsolatedAccount", predicted);
    expect(await account.owner()).to.equal((await ethers.getSigners())[0].address);
    expect(await account.policyHook()).to.equal(hook.target as string);
    expect(await hook.isInitialized(predicted)).to.equal(true);
  });

  it("reverts for zero module address", async () => {
    const salt = ethers.keccak256(ethers.toUtf8Bytes("aa-account-2"));

    await expect(
      factory.deployAccount(salt, ethers.ZeroAddress, [{ module: ethers.ZeroAddress, initData: "0x" }])
    ).to.be.revertedWithCustomError(factory, "ZeroModuleAddress");
  });
});

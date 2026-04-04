import { expect } from "chai";
import { ethers } from "hardhat";

const CALLTYPE_SINGLE = "0x00";

function buildMode(callType: string): string {
  return callType + "00".repeat(31);
}

function encodeSingle(target: string, value: bigint, callData: string): string {
  return ethers.solidityPacked(["address", "uint256", "bytes"], [target, value, callData]);
}

describe("EmergencyControls", () => {
  it("pauses and unpauses via account execute path", async () => {
    const [owner] = await ethers.getSigners();
    const hook = await (await ethers.getContractFactory("PolicyHook")).deploy();
    const emergency = await (await ethers.getContractFactory("EmergencyControls")).deploy();
    const account = await (await ethers.getContractFactory("IsolatedAccount")).deploy(
      owner.address,
      await hook.getAddress(),
      ethers.ZeroAddress
    );

    await account.installModule(await hook.getAddress(), "0x");
    await account.installModule(await emergency.getAddress(), "0x");

    const pauseCall = emergency.interface.encodeFunctionData("pause", [await hook.getAddress()]);
    await account.execute(
      buildMode(CALLTYPE_SINGLE),
      encodeSingle(await emergency.getAddress(), 0n, pauseCall)
    );
    expect((await hook.getPolicy(account.target as string)).paused).to.equal(true);

    const unpauseCall = emergency.interface.encodeFunctionData("unpause", [await hook.getAddress()]);
    await account.execute(
      buildMode(CALLTYPE_SINGLE),
      encodeSingle(await emergency.getAddress(), 0n, unpauseCall)
    );
    expect((await hook.getPolicy(account.target as string)).paused).to.equal(false);
  });

  it("emergencyShutdown pauses hook and revokes session", async () => {
    const [owner, agent] = await ethers.getSigners();
    const hook = await (await ethers.getContractFactory("PolicyHook")).deploy();
    const emergency = await (await ethers.getContractFactory("EmergencyControls")).deploy();
    const validator = await (await ethers.getContractFactory("AgentSessionValidator")).deploy();
    const account = await (await ethers.getContractFactory("IsolatedAccount")).deploy(
      owner.address,
      await hook.getAddress(),
      ethers.ZeroAddress
    );

    await account.installModule(await hook.getAddress(), "0x");
    await account.installModule(await emergency.getAddress(), "0x");
    await account.installModule(
      await validator.getAddress(),
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint48", "uint48"],
        [agent.address, 0, 0]
      )
    );

    const shutdownCall = emergency.interface.encodeFunctionData("emergencyShutdown", [
      await hook.getAddress(),
      await validator.getAddress(),
    ]);
    await account.execute(
      buildMode(CALLTYPE_SINGLE),
      encodeSingle(await emergency.getAddress(), 0n, shutdownCall)
    );

    expect((await hook.getPolicy(account.target as string)).paused).to.equal(true);
    expect((await validator.getSession(account.target as string)).revoked).to.equal(true);
  });
});

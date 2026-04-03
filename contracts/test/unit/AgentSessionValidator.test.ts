import { expect } from "chai";
import { ethers } from "hardhat";
import { AgentSessionValidator } from "../../typechain-types";
import type { PackedUserOperationStruct } from "../../typechain-types/src/validators/AgentSessionValidator";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildUserOp(
  sender: string,
  signature: string
): PackedUserOperationStruct {
  return {
    sender,
    nonce: 0n,
    initCode: "0x",
    callData: "0x",
    accountGasLimits: ethers.zeroPadValue("0x", 32),
    preVerificationGas: 0n,
    gasFees: ethers.zeroPadValue("0x", 32),
    paymasterAndData: "0x",
    signature,
  };
}

async function signUserOpHash(
  wallet: { signMessage: (msg: Uint8Array) => Promise<string> },
  hash: string
): Promise<string> {
  // ethers.Wallet.signMessage prepends \x19Ethereum Signed Message:\n32
  // matching MessageHashUtils.toEthSignedMessageHash in Solidity
  return wallet.signMessage(ethers.getBytes(hash));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AgentSessionValidator", () => {
  let validator: AgentSessionValidator;

  beforeEach(async () => {
    const Factory = await ethers.getContractFactory("AgentSessionValidator");
    validator = await Factory.deploy();
  });

  describe("session creation via onInstall", () => {
    it("creates a session with the provided agent key", async () => {
      const [account] = await ethers.getSigners();
      const agentWallet = ethers.Wallet.createRandom();

      const validAfter = 0n;
      const validUntil = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour

      const initData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint48", "uint48"],
        [agentWallet.address, validAfter, validUntil]
      );

      // onInstall: msg.sender = account
      await validator.connect(account).onInstall(initData);

      const session = await validator.getSession(account.address);
      expect(session.agentKey).to.equal(agentWallet.address);
      expect(session.validUntil).to.equal(validUntil);
      expect(session.revoked).to.be.false;
    });

    it("reverts if already initialized", async () => {
      const [account] = await ethers.getSigners();
      const agentWallet = ethers.Wallet.createRandom();
      const initData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint48", "uint48"],
        [agentWallet.address, 0n, 0n]
      );

      await validator.connect(account).onInstall(initData);

      await expect(validator.connect(account).onInstall(initData))
        .to.be.revertedWithCustomError(validator, "AlreadyInitialized");
    });
  });

  describe("validateUserOp", () => {
    it("returns SUCCESS for a valid agent signature", async () => {
      const [account] = await ethers.getSigners();
      const agentWallet = ethers.Wallet.createRandom();

      const validAfter = 0n;
      const validUntil = 0n; // no expiry

      const initData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint48", "uint48"],
        [agentWallet.address, validAfter, validUntil]
      );
      await validator.connect(account).onInstall(initData);

      const userOpHash = ethers.keccak256(ethers.toUtf8Bytes("test-userop-hash"));
      const signature  = await signUserOpHash(agentWallet, userOpHash);
      const userOp     = buildUserOp(account.address, signature);

      const validationData = await validator.validateUserOp(userOp, userOpHash);

      // bits[0] = 0 means success; validAfter=0, validUntil=0
      expect(validationData).to.equal(0n);
    });

    it("returns FAILED for a wrong signing key", async () => {
      const [account] = await ethers.getSigners();
      const agentWallet   = ethers.Wallet.createRandom();
      const wrongWallet   = ethers.Wallet.createRandom();

      const initData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint48", "uint48"],
        [agentWallet.address, 0n, 0n]
      );
      await validator.connect(account).onInstall(initData);

      const userOpHash = ethers.keccak256(ethers.toUtf8Bytes("test-userop-hash"));
      const signature  = await signUserOpHash(wrongWallet, userOpHash); // wrong key
      const userOp     = buildUserOp(account.address, signature);

      const validationData = await validator.validateUserOp(userOp, userOpHash);
      expect(validationData & 1n).to.equal(1n); // bit[0] = 1 means failure
    });

    it("encodes validAfter and validUntil in validationData", async () => {
      const [account] = await ethers.getSigners();
      const agentWallet = ethers.Wallet.createRandom();

      const now        = BigInt(Math.floor(Date.now() / 1000));
      const validAfter = now + 3600n;  // 1 hour in future
      const validUntil = now + 7200n;  // 2 hours in future

      const initData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint48", "uint48"],
        [agentWallet.address, validAfter, validUntil]
      );
      await validator.connect(account).onInstall(initData);

      const userOpHash = ethers.keccak256(ethers.toUtf8Bytes("hash"));
      const signature  = await signUserOpHash(agentWallet, userOpHash);
      const userOp     = buildUserOp(account.address, signature);

      const validationData = await validator.validateUserOp(userOp, userOpHash);

      // Decode: bits[160..207] = validAfter, bits[208..255] = validUntil
      const decodedValidAfter = (validationData >> 160n) & ((1n << 48n) - 1n);
      const decodedValidUntil = (validationData >> 208n) & ((1n << 48n) - 1n);

      expect(decodedValidAfter).to.equal(validAfter);
      expect(decodedValidUntil).to.equal(validUntil);
    });

    it("returns FAILED for a revoked session", async () => {
      const [account] = await ethers.getSigners();
      const agentWallet = ethers.Wallet.createRandom();

      const initData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint48", "uint48"],
        [agentWallet.address, 0n, 0n]
      );
      await validator.connect(account).onInstall(initData);
      await validator.connect(account).revokeSession();

      const userOpHash = ethers.keccak256(ethers.toUtf8Bytes("hash"));
      const signature  = await signUserOpHash(agentWallet, userOpHash);
      const userOp     = buildUserOp(account.address, signature);

      const validationData = await validator.validateUserOp(userOp, userOpHash);
      expect(validationData & 1n).to.equal(1n);
    });

    it("returns FAILED when no session exists", async () => {
      const [account] = await ethers.getSigners();
      const userOpHash = ethers.keccak256(ethers.toUtf8Bytes("hash"));
      const userOp     = buildUserOp(account.address, "0x");

      const validationData = await validator.validateUserOp(userOp, userOpHash);
      expect(validationData & 1n).to.equal(1n);
    });
  });

  describe("session lifecycle", () => {
    it("hasActiveSession returns correct state", async () => {
      const [account] = await ethers.getSigners();
      const agentWallet = ethers.Wallet.createRandom();

      expect(await validator.hasActiveSession(account.address)).to.be.false;

      const initData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint48", "uint48"],
        [agentWallet.address, 0n, 0n]
      );
      await validator.connect(account).onInstall(initData);
      expect(await validator.hasActiveSession(account.address)).to.be.true;

      await validator.connect(account).revokeSession();
      expect(await validator.hasActiveSession(account.address)).to.be.false;
    });

    it("createSession overwrites the existing session", async () => {
      const [account] = await ethers.getSigners();
      const agentWallet1 = ethers.Wallet.createRandom();
      const agentWallet2 = ethers.Wallet.createRandom();

      const initData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint48", "uint48"],
        [agentWallet1.address, 0n, 0n]
      );
      await validator.connect(account).onInstall(initData);

      // Replace with a new session
      await validator.connect(account).createSession(agentWallet2.address, 0n, 0n);

      const session = await validator.getSession(account.address);
      expect(session.agentKey).to.equal(agentWallet2.address);
      expect(session.nonce).to.equal(2n); // incremented twice (once on install, once on create)
    });

    it("emits SessionCreated on install", async () => {
      const [account] = await ethers.getSigners();
      const agentWallet = ethers.Wallet.createRandom();
      const validUntil  = 9999999999n;

      const initData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint48", "uint48"],
        [agentWallet.address, 0n, validUntil]
      );

      await expect(validator.connect(account).onInstall(initData))
        .to.emit(validator, "SessionCreated")
        .withArgs(account.address, 1n, agentWallet.address, 0n, validUntil);
    });

    it("emits SessionRevoked on revocation", async () => {
      const [account] = await ethers.getSigners();
      const agentWallet = ethers.Wallet.createRandom();

      const initData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint48", "uint48"],
        [agentWallet.address, 0n, 0n]
      );
      await validator.connect(account).onInstall(initData);

      await expect(validator.connect(account).revokeSession())
        .to.emit(validator, "SessionRevoked")
        .withArgs(account.address, 1n);
    });
  });
});

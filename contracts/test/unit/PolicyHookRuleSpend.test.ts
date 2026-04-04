import { expect } from "chai";
import { ethers } from "hardhat";
import { PolicyHookRuleSpend, MockERC20 } from "../../typechain-types";
import { time } from "@nomicfoundation/hardhat-network-helpers";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const EXECUTE_SELECTOR = ethers.id("execute(bytes32,bytes)").slice(0, 10);
const CALLTYPE_SINGLE  = "0x00";
const SPEND_DISABLED   = 255;

function buildMode(callType: string): string {
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

function abiWord(type: string, value: unknown): string {
  return ethers.AbiCoder.defaultAbiCoder().encode([type], [value]);
}

async function deployHook(): Promise<PolicyHookRuleSpend> {
  const hook = await (await ethers.getContractFactory("PolicyHookRuleSpend")).deploy();
  await hook.onInstall("0x");
  return hook;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PolicyHookRuleSpend", () => {
  let hook: PolicyHookRuleSpend;
  let token: MockERC20;
  let tokenAddr: string;
  let accountAddr: string;
  let recipientA: string;
  let recipientB: string;

  const TRANSFER_SEL = ethers.id("transfer(address,uint256)").slice(0, 10) as `0x${string}`;
  const DAY = 86400;

  beforeEach(async () => {
    const [account, a, b] = await ethers.getSigners();
    accountAddr = account.address;
    recipientA  = a.address;
    recipientB  = b.address;

    hook      = await deployHook();
    token     = await (await ethers.getContractFactory("MockERC20")).deploy();
    tokenAddr = await token.getAddress();
  });

  // -------------------------------------------------------------------------
  // addEqRule still works without spend tracking
  // -------------------------------------------------------------------------

  describe("addEqRule (no spend tracking)", () => {
    it("allows a matching call", async () => {
      await hook.addEqRule(tokenAddr, TRANSFER_SEL, [
        { paramIndex: 0, expectedValue: abiWord("address", recipientA) as `0x${string}` },
      ]);

      const callData = token.interface.encodeFunctionData("transfer", [recipientA, 999n]);
      const msgData  = buildMsgData(buildMode(CALLTYPE_SINGLE), encodeSingle(tokenAddr, 0n, callData));
      await expect(hook.preCheck(ethers.ZeroAddress, 0n, msgData)).to.not.be.reverted;
    });

    it("blocks a non-matching call", async () => {
      await hook.addEqRule(tokenAddr, TRANSFER_SEL, [
        { paramIndex: 0, expectedValue: abiWord("address", recipientA) as `0x${string}` },
      ]);

      const callData = token.interface.encodeFunctionData("transfer", [recipientB, 999n]);
      const msgData  = buildMsgData(buildMode(CALLTYPE_SINGLE), encodeSingle(tokenAddr, 0n, callData));
      await expect(hook.preCheck(ethers.ZeroAddress, 0n, msgData))
        .to.be.revertedWithCustomError(hook, "EqRuleNotSatisfied");
    });
  });

  // -------------------------------------------------------------------------
  // addEqRuleWithSpend — per-rule spend limit
  // -------------------------------------------------------------------------

  describe("addEqRuleWithSpend", () => {
    it("allows a transfer within the per-rule limit", async () => {
      const limit = ethers.parseUnits("100", 6); // 100 USDC
      await hook.addEqRuleWithSpend(
        tokenAddr, TRANSFER_SEL,
        [{ paramIndex: 0, expectedValue: abiWord("address", recipientA) as `0x${string}` }],
        { spendParamIndex: 1, maxPerPeriod: limit, periodDuration: DAY }
      );

      const callData = token.interface.encodeFunctionData("transfer", [recipientA, ethers.parseUnits("50", 6)]);
      const msgData  = buildMsgData(buildMode(CALLTYPE_SINGLE), encodeSingle(tokenAddr, 0n, callData));
      await expect(hook.preCheck(ethers.ZeroAddress, 0n, msgData)).to.not.be.reverted;
    });

    it("reverts when periodDuration is zero with spend enabled", async () => {
      await expect(
        hook.addEqRuleWithSpend(
          tokenAddr,
          TRANSFER_SEL,
          [{ paramIndex: 0, expectedValue: abiWord("address", recipientA) as `0x${string}` }],
          { spendParamIndex: 1, maxPerPeriod: ethers.parseUnits("100", 6), periodDuration: 0 }
        )
      ).to.be.revertedWithCustomError(hook, "RuleSpendInvalidPeriod");
    });

    it("reverts when per-rule limit is exceeded", async () => {
      const limit = ethers.parseUnits("100", 6);
      await hook.addEqRuleWithSpend(
        tokenAddr, TRANSFER_SEL,
        [{ paramIndex: 0, expectedValue: abiWord("address", recipientA) as `0x${string}` }],
        { spendParamIndex: 1, maxPerPeriod: limit, periodDuration: DAY }
      );

      const callData = token.interface.encodeFunctionData("transfer", [recipientA, ethers.parseUnits("101", 6)]);
      const msgData  = buildMsgData(buildMode(CALLTYPE_SINGLE), encodeSingle(tokenAddr, 0n, callData));
      await expect(hook.preCheck(ethers.ZeroAddress, 0n, msgData))
        .to.be.revertedWithCustomError(hook, "RuleSpendLimitExceeded");
    });

    it("accumulates spend across calls within the same window", async () => {
      const limit = ethers.parseUnits("100", 6);
      await hook.addEqRuleWithSpend(
        tokenAddr, TRANSFER_SEL,
        [{ paramIndex: 0, expectedValue: abiWord("address", recipientA) as `0x${string}` }],
        { spendParamIndex: 1, maxPerPeriod: limit, periodDuration: DAY }
      );

      const callData60 = token.interface.encodeFunctionData("transfer", [recipientA, ethers.parseUnits("60", 6)]);
      const msgData60  = buildMsgData(buildMode(CALLTYPE_SINGLE), encodeSingle(tokenAddr, 0n, callData60));

      await hook.preCheck(ethers.ZeroAddress, 0n, msgData60); // 60 — ok

      // 60 + 60 = 120 > 100 — should revert
      await expect(hook.preCheck(ethers.ZeroAddress, 0n, msgData60))
        .to.be.revertedWithCustomError(hook, "RuleSpendLimitExceeded");
    });

    it("resets spend after the window expires", async () => {
      const limit = ethers.parseUnits("100", 6);
      await hook.addEqRuleWithSpend(
        tokenAddr, TRANSFER_SEL,
        [{ paramIndex: 0, expectedValue: abiWord("address", recipientA) as `0x${string}` }],
        { spendParamIndex: 1, maxPerPeriod: limit, periodDuration: DAY }
      );

      const callData = token.interface.encodeFunctionData("transfer", [recipientA, ethers.parseUnits("90", 6)]);
      const msgData  = buildMsgData(buildMode(CALLTYPE_SINGLE), encodeSingle(tokenAddr, 0n, callData));

      await hook.preCheck(ethers.ZeroAddress, 0n, msgData); // 90 — ok

      // Advance time past the 1-day window
      await time.increase(DAY + 1);

      // Window has reset — 90 should pass again
      await expect(hook.preCheck(ethers.ZeroAddress, 0n, msgData)).to.not.be.reverted;
    });

    it("enforces independent limits per rule (Bob vs Alice)", async () => {
      const bobLimit   = ethers.parseUnits("100", 6);
      const aliceLimit = ethers.parseUnits("50", 6);

      await hook.addEqRuleWithSpend(
        tokenAddr, TRANSFER_SEL,
        [{ paramIndex: 0, expectedValue: abiWord("address", recipientA) as `0x${string}` }],
        { spendParamIndex: 1, maxPerPeriod: bobLimit, periodDuration: DAY }
      );
      await hook.addEqRuleWithSpend(
        tokenAddr, TRANSFER_SEL,
        [{ paramIndex: 0, expectedValue: abiWord("address", recipientB) as `0x${string}` }],
        { spendParamIndex: 1, maxPerPeriod: aliceLimit, periodDuration: DAY }
      );

      // Transfer 80 to Bob — ok (within Bob's 100 limit)
      const bobCallData = token.interface.encodeFunctionData("transfer", [recipientA, ethers.parseUnits("80", 6)]);
      const bobMsgData  = buildMsgData(buildMode(CALLTYPE_SINGLE), encodeSingle(tokenAddr, 0n, bobCallData));
      await expect(hook.preCheck(ethers.ZeroAddress, 0n, bobMsgData)).to.not.be.reverted;

      // Transfer 40 to Alice — ok (within Alice's 50 limit)
      const aliceCallData = token.interface.encodeFunctionData("transfer", [recipientB, ethers.parseUnits("40", 6)]);
      const aliceMsgData  = buildMsgData(buildMode(CALLTYPE_SINGLE), encodeSingle(tokenAddr, 0n, aliceCallData));
      await expect(hook.preCheck(ethers.ZeroAddress, 0n, aliceMsgData)).to.not.be.reverted;

      // Transfer 30 to Bob — exceeds Bob's remaining 20 (80 already spent)
      const bobCallData2 = token.interface.encodeFunctionData("transfer", [recipientA, ethers.parseUnits("30", 6)]);
      const bobMsgData2  = buildMsgData(buildMode(CALLTYPE_SINGLE), encodeSingle(tokenAddr, 0n, bobCallData2));
      await expect(hook.preCheck(ethers.ZeroAddress, 0n, bobMsgData2))
        .to.be.revertedWithCustomError(hook, "RuleSpendLimitExceeded");

      // Transfer 5 to Alice — ok (only 40 spent, 10 remaining)
      const aliceCallData2 = token.interface.encodeFunctionData("transfer", [recipientB, ethers.parseUnits("5", 6)]);
      const aliceMsgData2  = buildMsgData(buildMode(CALLTYPE_SINGLE), encodeSingle(tokenAddr, 0n, aliceCallData2));
      await expect(hook.preCheck(ethers.ZeroAddress, 0n, aliceMsgData2)).to.not.be.reverted;
    });

    it("per-rule limit and global limit are enforced independently", async () => {
      const ruleLimit   = ethers.parseUnits("200", 6); // generous per-rule
      const globalLimit = ethers.parseUnits("100", 6); // tight global backstop

      await hook.addEqRuleWithSpend(
        tokenAddr, TRANSFER_SEL,
        [{ paramIndex: 0, expectedValue: abiWord("address", recipientA) as `0x${string}` }],
        { spendParamIndex: 1, maxPerPeriod: ruleLimit, periodDuration: DAY }
      );
      // Global limit applies to all ERC-20 transfers via ERC20SpendDecoder
      await hook.setSpendLimit(tokenAddr, globalLimit, BigInt(DAY));

      // 80 — within both limits
      const callData80 = token.interface.encodeFunctionData("transfer", [recipientA, ethers.parseUnits("80", 6)]);
      const msgData80  = buildMsgData(buildMode(CALLTYPE_SINGLE), encodeSingle(tokenAddr, 0n, callData80));
      await hook.preCheck(ethers.ZeroAddress, 0n, msgData80);

      // 80 again — within rule limit (160 < 200) but exceeds global (160 > 100)
      await expect(hook.preCheck(ethers.ZeroAddress, 0n, msgData80))
        .to.be.revertedWithCustomError(hook, "SpendLimitExceeded");
    });
  });

  // -------------------------------------------------------------------------
  // getRuleSpendState
  // -------------------------------------------------------------------------

  describe("getRuleSpendState", () => {
    it("returns initial spend state after adding a rule", async () => {
      const limit = ethers.parseUnits("100", 6);
      const conditions = [
        { paramIndex: 0, expectedValue: abiWord("address", recipientA) as `0x${string}` },
      ];
      const ruleId = await hook.computeEqRuleId(tokenAddr, TRANSFER_SEL, conditions);

      await hook.addEqRuleWithSpend(
        tokenAddr, TRANSFER_SEL, conditions,
        { spendParamIndex: 1, maxPerPeriod: limit, periodDuration: DAY }
      );

      const state = await hook.getRuleSpendState(accountAddr, ruleId);
      expect(state.spendParamIndex).to.equal(1);
      expect(state.maxPerPeriod).to.equal(limit);
      expect(state.periodDuration).to.equal(DAY);
      expect(state.spentInPeriod).to.equal(0n);
      expect(state.periodStart).to.be.gt(0n);
    });

    it("reflects accumulated spend after a call", async () => {
      const limit = ethers.parseUnits("100", 6);
      const spend50 = ethers.parseUnits("50", 6);
      const conditions = [
        { paramIndex: 0, expectedValue: abiWord("address", recipientA) as `0x${string}` },
      ];
      const ruleId = await hook.computeEqRuleId(tokenAddr, TRANSFER_SEL, conditions);

      await hook.addEqRuleWithSpend(
        tokenAddr, TRANSFER_SEL, conditions,
        { spendParamIndex: 1, maxPerPeriod: limit, periodDuration: DAY }
      );

      const callData = token.interface.encodeFunctionData("transfer", [recipientA, spend50]);
      const msgData  = buildMsgData(buildMode(CALLTYPE_SINGLE), encodeSingle(tokenAddr, 0n, callData));
      await hook.preCheck(ethers.ZeroAddress, 0n, msgData);

      const state = await hook.getRuleSpendState(accountAddr, ruleId);
      expect(state.spentInPeriod).to.equal(spend50);
    });
  });

  // -------------------------------------------------------------------------
  // Aave-style use case: supply WETH, borrow USDC
  // -------------------------------------------------------------------------

  describe("Aave use case: supply WETH + borrow USDC", () => {
    // Simulate Aave Pool interface with the real selectors
    const SUPPLY_SEL = "0x617ba037" as `0x${string}`; // supply(address,uint256,address,uint16)
    const BORROW_SEL = "0xa415bcad" as `0x${string}`; // borrow(address,uint256,uint256,uint16,address)

    let aavePool: string;
    let weth: string;
    let usdc: string;
    let wallet: string;

    beforeEach(async () => {
      const [account, poolSigner, wethSigner, usdcSigner] = await ethers.getSigners();
      wallet   = account.address;
      aavePool = poolSigner.address;
      weth     = wethSigner.address;
      usdc     = usdcSigner.address;
    });

    it("allows supply(WETH, amount, wallet, 0) — correct asset and onBehalfOf", async () => {
      // Pin: asset=WETH (param 0), onBehalfOf=wallet (param 2)
      await hook.addEqRuleWithSpend(
        aavePool, SUPPLY_SEL,
        [
          { paramIndex: 0, expectedValue: abiWord("address", weth) as `0x${string}` },
          { paramIndex: 2, expectedValue: abiWord("address", wallet) as `0x${string}` },
        ],
        { spendParamIndex: 1, maxPerPeriod: ethers.parseUnits("1", 18), periodDuration: DAY }
      );

      // supply(WETH, 0.5 WETH, wallet, 0)
      const callData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint256", "address", "uint16"],
        [weth, ethers.parseUnits("0.5", 18), wallet, 0]
      );
      const msgData = buildMsgData(
        buildMode(CALLTYPE_SINGLE),
        encodeSingle(aavePool, 0n, SUPPLY_SEL + callData.slice(2))
      );
      await expect(hook.preCheck(ethers.ZeroAddress, 0n, msgData)).to.not.be.reverted;
    });

    it("blocks supply when onBehalfOf is not the wallet", async () => {
      await hook.addEqRuleWithSpend(
        aavePool, SUPPLY_SEL,
        [
          { paramIndex: 0, expectedValue: abiWord("address", weth) as `0x${string}` },
          { paramIndex: 2, expectedValue: abiWord("address", wallet) as `0x${string}` },
        ],
        { spendParamIndex: 1, maxPerPeriod: ethers.parseUnits("10", 18), periodDuration: DAY }
      );

      // supply(WETH, 1 WETH, recipientA, 0) — wrong onBehalfOf
      const callData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint256", "address", "uint16"],
        [weth, ethers.parseUnits("1", 18), recipientA, 0]
      );
      const msgData = buildMsgData(
        buildMode(CALLTYPE_SINGLE),
        encodeSingle(aavePool, 0n, SUPPLY_SEL + callData.slice(2))
      );
      await expect(hook.preCheck(ethers.ZeroAddress, 0n, msgData))
        .to.be.revertedWithCustomError(hook, "EqRuleNotSatisfied");
    });

    it("blocks supply when daily WETH cap is exceeded", async () => {
      const wethCap = ethers.parseUnits("1", 18); // 1 WETH/day
      await hook.addEqRuleWithSpend(
        aavePool, SUPPLY_SEL,
        [
          { paramIndex: 0, expectedValue: abiWord("address", weth) as `0x${string}` },
          { paramIndex: 2, expectedValue: abiWord("address", wallet) as `0x${string}` },
        ],
        { spendParamIndex: 1, maxPerPeriod: wethCap, periodDuration: DAY }
      );

      // supply 1.5 WETH — exceeds 1 WETH cap
      const callData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint256", "address", "uint16"],
        [weth, ethers.parseUnits("1.5", 18), wallet, 0]
      );
      const msgData = buildMsgData(
        buildMode(CALLTYPE_SINGLE),
        encodeSingle(aavePool, 0n, SUPPLY_SEL + callData.slice(2))
      );
      await expect(hook.preCheck(ethers.ZeroAddress, 0n, msgData))
        .to.be.revertedWithCustomError(hook, "RuleSpendLimitExceeded");
    });

    it("allows borrow(USDC, amount, 2, 0, wallet) — variable rate, correct asset and onBehalfOf", async () => {
      // Pin: asset=USDC (param 0), onBehalfOf=wallet (param 4)
      await hook.addEqRuleWithSpend(
        aavePool, BORROW_SEL,
        [
          { paramIndex: 0, expectedValue: abiWord("address", usdc) as `0x${string}` },
          { paramIndex: 4, expectedValue: abiWord("address", wallet) as `0x${string}` },
        ],
        { spendParamIndex: 1, maxPerPeriod: ethers.parseUnits("1000", 6), periodDuration: DAY }
      );

      // borrow(USDC, 500 USDC, 2=variable, 0, wallet)
      const callData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint256", "uint256", "uint16", "address"],
        [usdc, ethers.parseUnits("500", 6), 2n, 0, wallet]
      );
      const msgData = buildMsgData(
        buildMode(CALLTYPE_SINGLE),
        encodeSingle(aavePool, 0n, BORROW_SEL + callData.slice(2))
      );
      await expect(hook.preCheck(ethers.ZeroAddress, 0n, msgData)).to.not.be.reverted;
    });

    it("blocks borrow when onBehalfOf is not the wallet", async () => {
      await hook.addEqRuleWithSpend(
        aavePool, BORROW_SEL,
        [
          { paramIndex: 0, expectedValue: abiWord("address", usdc) as `0x${string}` },
          { paramIndex: 4, expectedValue: abiWord("address", wallet) as `0x${string}` },
        ],
        { spendParamIndex: 1, maxPerPeriod: ethers.parseUnits("1000", 6), periodDuration: DAY }
      );

      // borrow with wrong onBehalfOf
      const callData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint256", "uint256", "uint16", "address"],
        [usdc, ethers.parseUnits("500", 6), 2n, 0, recipientA]
      );
      const msgData = buildMsgData(
        buildMode(CALLTYPE_SINGLE),
        encodeSingle(aavePool, 0n, BORROW_SEL + callData.slice(2))
      );
      await expect(hook.preCheck(ethers.ZeroAddress, 0n, msgData))
        .to.be.revertedWithCustomError(hook, "EqRuleNotSatisfied");
    });
  });

  // -------------------------------------------------------------------------
  // Enumeration views — getPolicySnapshot / getWhitelistEntries / getRules
  // -------------------------------------------------------------------------

  describe("enumeration views", () => {
    it("getWhitelistEntries returns active coarse-whitelist entries", async () => {
      const APPROVE_SEL = ethers.id("approve(address,uint256)").slice(0, 10) as `0x${string}`;

      await hook.addWhitelistEntry(tokenAddr, TRANSFER_SEL);
      await hook.addWhitelistEntry(tokenAddr, APPROVE_SEL);

      const entries = await hook.getWhitelistEntries(accountAddr);
      expect(entries.length).to.equal(2);
      expect(entries.map((e: any) => e.selector)).to.include(TRANSFER_SEL);
      expect(entries.map((e: any) => e.selector)).to.include(APPROVE_SEL);

      // Remove one — should disappear from enumeration
      await hook.removeWhitelistEntry(tokenAddr, TRANSFER_SEL);
      const after = await hook.getWhitelistEntries(accountAddr);
      expect(after.length).to.equal(1);
      expect(after[0].selector).to.equal(APPROVE_SEL);
    });

    it("getSpendLimits returns configured global spend limits", async () => {
      const limit = ethers.parseUnits("100", 6);
      await hook.setSpendLimit(tokenAddr, limit, BigInt(DAY));

      const limits = await hook.getSpendLimits(accountAddr);
      expect(limits.length).to.equal(1);
      expect(limits[0].token).to.equal(tokenAddr);
      expect(limits[0].maxPerPeriod).to.equal(limit);
      expect(limits[0].periodDuration).to.equal(BigInt(DAY));
    });

    it("getRules returns active rules with conditions and spend state", async () => {
      const limit = ethers.parseUnits("100", 6);
      await hook.addEqRuleWithSpend(
        tokenAddr, TRANSFER_SEL,
        [{ paramIndex: 0, expectedValue: abiWord("address", recipientA) as `0x${string}` }],
        { spendParamIndex: 1, maxPerPeriod: limit, periodDuration: DAY }
      );
      await hook.addEqRule(tokenAddr, TRANSFER_SEL, [
        { paramIndex: 0, expectedValue: abiWord("address", recipientB) as `0x${string}` },
      ]);

      const rules = await hook.getRules(accountAddr);
      expect(rules.length).to.equal(2);

      const spendRule = rules.find((r: any) => BigInt(r.spendParamIndex) === 1n);
      expect(spendRule).to.not.be.undefined;
      expect(spendRule.maxPerPeriod).to.equal(limit);
      expect(spendRule.conditions.length).to.equal(1);

      const plainRule = rules.find((r: any) => BigInt(r.spendParamIndex) === BigInt(SPEND_DISABLED));
      expect(plainRule).to.not.be.undefined;
    });

    it("removed rules do not appear in getRules", async () => {
      await hook.addEqRule(tokenAddr, TRANSFER_SEL, [
        { paramIndex: 0, expectedValue: abiWord("address", recipientA) as `0x${string}` },
      ]);
      const conditions = [{ paramIndex: 0, expectedValue: abiWord("address", recipientA) as `0x${string}` }];
      const ruleId = await hook.computeEqRuleId(tokenAddr, TRANSFER_SEL, conditions);
      await hook.removeEqRule(ruleId);

      const rules = await hook.getRules(accountAddr);
      expect(rules.length).to.equal(0);
    });

    it("getPolicySnapshot returns combined state", async () => {
      const APPROVE_SEL = ethers.id("approve(address,uint256)").slice(0, 10) as `0x${string}`;
      const limit = ethers.parseUnits("500", 6);

      await hook.addWhitelistEntry(tokenAddr, APPROVE_SEL);
      await hook.setSpendLimit(tokenAddr, limit, BigInt(DAY));
      await hook.addEqRuleWithSpend(
        tokenAddr, TRANSFER_SEL,
        [{ paramIndex: 0, expectedValue: abiWord("address", recipientA) as `0x${string}` }],
        { spendParamIndex: 1, maxPerPeriod: ethers.parseUnits("100", 6), periodDuration: DAY }
      );

      const snapshot = await hook.getPolicySnapshot(accountAddr);

      expect(snapshot.whitelistEntries.length).to.equal(1);
      expect(snapshot.whitelistEntries[0].selector).to.equal(APPROVE_SEL);

      expect(snapshot.spendLimits.length).to.equal(1);
      expect(snapshot.spendLimits[0].maxPerPeriod).to.equal(limit);

      expect(snapshot.rules.length).to.equal(1);
      expect(snapshot.rules[0].spendParamIndex).to.equal(1);

      expect(snapshot.config.paused).to.be.false;
    });
  });
});

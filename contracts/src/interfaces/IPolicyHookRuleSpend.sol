// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { IPolicyHookEq } from "./IPolicyHookEq.sol";

/// @notice Policy hook with per-rule spend limits layered on top of equality rules.
///
/// Each EqRule can optionally carry its own rolling spend window that tracks a
/// specific ABI word in the matched calldata as an amount. This lets you express:
///
///   "transfer USDC to Bob, limit $100/day"
///   "transfer USDC to Alice, limit $50/day"
///   "supply WETH to Aave, cap 1 WETH/day"
///
/// The per-rule limit and the global per-token limit (from IPolicyHook.setSpendLimit)
/// are both enforced independently — both must pass. The global limit acts as a
/// shared backstop across all rules on the same token.
///
/// Enforcement order for a matched call:
///   1. per-rule spend limit (if spendParamIndex != SPEND_DISABLED)
///   2. global per-token spend limit (existing ERC-20 decoder logic)
///
/// Module type: Hook (4)
interface IPolicyHookRuleSpend is IPolicyHookEq {
    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    /// @dev Sentinel value for SpendRuleConfig.spendParamIndex meaning "no tracking".
    // uint8 public constant SPEND_DISABLED = type(uint8).max; // 255

    // -------------------------------------------------------------------------
    // Types
    // -------------------------------------------------------------------------

    /// @notice Per-rule spend configuration.
    /// @param spendParamIndex  Zero-based ABI param index (after the selector) whose
    ///                         32-byte word is treated as the spend amount (uint256).
    ///                         Set to 255 to disable per-rule spend tracking.
    /// @param maxPerPeriod     Maximum amount permitted per rolling window.
    /// @param periodDuration   Window length in seconds (e.g. 86400 = 1 day).
    struct SpendRuleConfig {
        uint8   spendParamIndex;
        uint256 maxPerPeriod;
        uint256 periodDuration;
    }

    /// @notice Per-rule spend state (config + mutable rolling window).
    /// Returned by getRuleSpendState for inspection.
    struct RuleSpendState {
        uint8   spendParamIndex;
        uint256 maxPerPeriod;
        uint256 periodDuration;
        uint256 spentInPeriod;
        uint256 periodStart;
    }

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event RuleSpendLimitSet(
        address indexed account,
        bytes32 indexed ruleId,
        uint8   spendParamIndex,
        uint256 maxPerPeriod,
        uint256 periodDuration
    );

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error RuleSpendLimitExceeded(bytes32 ruleId, uint256 requested, uint256 remaining);
    error RuleSpendCalldataTooShort(bytes32 ruleId, uint256 required, uint256 actual);
    /// @dev Reverts when per-rule spend is enabled but periodDuration is zero.
    error RuleSpendInvalidPeriod();

    // -------------------------------------------------------------------------
    // Per-rule spend configuration (owner-callable through account execute path)
    // -------------------------------------------------------------------------

    /// @notice Adds an equality rule WITH a per-rule spend limit.
    /// @dev Conditions must be sorted by paramIndex in strictly increasing order.
    ///      spendParamIndex must refer to a static uint256-compatible ABI word.
    ///      Pass spend.spendParamIndex == 255 to add a rule without spend tracking
    ///      (identical to IPolicyHookEq.addEqRule in that case).
    ///      If spend is enabled, periodDuration must be greater than zero.
    function addEqRuleWithSpend(
        address target,
        bytes4 selector,
        EqCondition[] calldata conditions,
        SpendRuleConfig calldata spend
    ) external returns (bytes32 ruleId);

    /// @notice Returns the spend state for a given rule.
    function getRuleSpendState(
        address account,
        bytes32 ruleId
    ) external view returns (RuleSpendState memory);

    // -------------------------------------------------------------------------
    // Enumeration views — for UI rendering
    // -------------------------------------------------------------------------

    struct WhitelistEntryView {
        address target;
        bytes4  selector;
    }

    struct SpendLimitView {
        address token;
        uint256 maxPerPeriod;
        uint256 periodDuration;
        uint256 spentInPeriod;
        uint256 periodStart;
    }

    /// @notice Flat view of a single rule including conditions and spend state.
    struct RuleView {
        bytes32        ruleId;
        address        target;
        bytes4         selector;
        EqCondition[]  conditions;
        uint8          spendParamIndex; // 255 = no spend tracking
        uint256        maxPerPeriod;
        uint256        periodDuration;
        uint256        spentInPeriod;
        uint256        periodStart;
    }

    /// @notice Full policy snapshot: config + whitelist + spend limits + rules.
    /// All active state in a single call. Designed for UI consumption.
    struct PolicySnapshot {
        PolicyConfig          config;
        WhitelistEntryView[]  whitelistEntries;
        SpendLimitView[]      spendLimits;
        RuleView[]            rules;
    }

    /// @notice Returns the complete policy state for an account in one call.
    function getPolicySnapshot(address account) external view returns (PolicySnapshot memory);

    /// @notice Returns all active coarse-whitelist (target, selector) entries.
    function getWhitelistEntries(address account) external view returns (WhitelistEntryView[] memory);

    /// @notice Returns all configured global per-token spend limits.
    function getSpendLimits(address account) external view returns (SpendLimitView[] memory);

    /// @notice Returns all active equality/spend rules with full detail.
    function getRules(address account) external view returns (RuleView[] memory);
}

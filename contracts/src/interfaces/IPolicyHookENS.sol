// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { IPolicyHookRuleSpend } from "./IPolicyHookRuleSpend.sol";

/// @notice Policy hook extension with ENS name verification for auditable policies.
///
/// Stores ENS namehashes alongside policy entries so that policies read as
/// human-readable names:
///
///   "uniswap-v3-router.eth : exactInputSingle"   instead of
///   "0x2626...81 : 0x414bf389"
///
/// ENS verification occurs at policy creation time: the contract resolves the
/// name on-chain (when a registry is available) and confirms it matches the
/// target address. The namehash is stored permanently for auditability.
///
/// An audit function lets anyone re-verify that stored names still resolve to
/// the expected addresses, detecting drift or ENS hijacking.
///
/// The enforcement path (preCheck) is unchanged — it uses raw addresses for
/// gas efficiency. ENS is a write-time verification and read-time audit layer.
///
/// Module type: Hook (4)
interface IPolicyHookENS is IPolicyHookRuleSpend {
    // -------------------------------------------------------------------------
    // Types
    // -------------------------------------------------------------------------

    /// @param ensNode     ENS namehash (keccak of recursive label hashes).
    /// @param verifiedAt  Block timestamp when the resolution was verified on-chain.
    struct ENSLabel {
        bytes32 ensNode;
        uint48  verifiedAt;
    }

    /// @notice Result of an ENS drift audit for a single target.
    /// @param target      The policy target address.
    /// @param ensNode     The stored ENS namehash.
    /// @param storedAddr  The address stored at policy creation time.
    /// @param currentAddr The address the name currently resolves to (0 = unresolvable).
    struct ENSDrift {
        address target;
        bytes32 ensNode;
        address storedAddr;
        address currentAddr;
    }

    // ── Extended view structs including ENS labels ──────────────────────────

    struct WhitelistEntryViewENS {
        address target;
        bytes4  selector;
        bytes32 ensNode;     // bytes32(0) if entry was created without ENS
    }

    struct RuleViewENS {
        bytes32        ruleId;
        address        target;
        bytes4         selector;
        bytes32        ensNode;  // bytes32(0) if rule was created without ENS
        EqCondition[]  conditions;
        uint8          spendParamIndex;
        uint256        maxPerPeriod;
        uint256        periodDuration;
        uint256        spentInPeriod;
        uint256        periodStart;
    }

    struct PolicySnapshotENS {
        PolicyConfig              config;
        WhitelistEntryViewENS[]   whitelistEntries;
        SpendLimitView[]          spendLimits;
        RuleViewENS[]             rules;
    }

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event ENSLabelStored(
        address indexed account,
        address indexed target,
        bytes32 indexed ensNode,
        uint48  verifiedAt
    );

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    /// @dev On-chain ENS resolution does not match the provided target address.
    error ENSResolutionMismatch(bytes32 ensNode, address expected, address actual);

    /// @dev The ENS node has no resolver or resolves to address(0).
    error ENSNotResolvable(bytes32 ensNode);

    // -------------------------------------------------------------------------
    // Configuration
    // -------------------------------------------------------------------------

    /// @notice Returns the ENS registry used for on-chain resolution.
    ///         address(0) means on-chain verification is disabled; labels are
    ///         stored as metadata only (namehash still useful for off-chain audit).
    function ensRegistry() external view returns (address);

    // -------------------------------------------------------------------------
    // ENS-aware policy creation
    // -------------------------------------------------------------------------

    /// @notice Adds a whitelist entry with ENS verification.
    /// @dev Resolves `ensNode` via the ENS registry (if set) and verifies it
    ///      matches `target`. Stores the namehash alongside the entry.
    /// @param target   Destination contract address.
    /// @param selector Allowed function selector (WILDCARD_SELECTOR = any).
    /// @param ensNode  ENS namehash of the target, e.g. namehash("uniswap-v3-router.eth").
    function addWhitelistEntryWithENS(
        address target,
        bytes4  selector,
        bytes32 ensNode
    ) external;

    /// @notice Adds an equality rule with spend limit AND ENS verification.
    /// @param target     Destination contract address.
    /// @param selector   Exact function selector.
    /// @param conditions Equality predicates on ABI words.
    /// @param spend      Per-rule spend configuration.
    /// @param ensNode    ENS namehash of the target.
    function addEqRuleWithSpendAndENS(
        address target,
        bytes4  selector,
        EqCondition[]   calldata conditions,
        SpendRuleConfig calldata spend,
        bytes32 ensNode
    ) external returns (bytes32 ruleId);

    // -------------------------------------------------------------------------
    // ENS audit & verification
    // -------------------------------------------------------------------------

    /// @notice Returns the stored ENS label for a target in an account's policy.
    function getENSLabel(
        address account,
        address target
    ) external view returns (ENSLabel memory);

    /// @notice Re-verifies a single target's ENS label against current resolution.
    /// @return valid       True if the name still resolves to the stored address.
    /// @return currentAddr The address the name currently resolves to.
    function verifyENSTarget(
        address account,
        address target
    ) external view returns (bool valid, address currentAddr);

    /// @notice Audits all ENS-labeled targets for an account.
    /// @return drifts Entries where the current resolution differs from stored address.
    function auditENSLabels(
        address account
    ) external view returns (ENSDrift[] memory drifts);

    // -------------------------------------------------------------------------
    // Extended views
    // -------------------------------------------------------------------------

    /// @notice Full policy snapshot including ENS labels on every entry and rule.
    function getPolicySnapshotWithENS(
        address account
    ) external view returns (PolicySnapshotENS memory);
}

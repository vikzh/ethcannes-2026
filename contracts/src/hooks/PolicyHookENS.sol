// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { IPolicyHookENS } from "../interfaces/IPolicyHookENS.sol";
import { PolicyHookRuleSpend } from "./PolicyHookRuleSpend.sol";
import { PolicyTypes } from "../types/PolicyTypes.sol";
import { ENSVerifier } from "../libs/ENSVerifier.sol";

/// @notice Policy hook with ENS-verified, human-auditable policies.
///
/// Extends PolicyHookRuleSpend with ENS name storage and verification.
/// At policy creation time, the caller provides an ENS namehash alongside the
/// target address. If an ENS registry is configured, the contract resolves the
/// name on-chain and verifies the match. The namehash is stored permanently.
///
/// This enables policies to display as:
///
///   "uniswap-v3-router.eth : exactInputSingle"   instead of
///   "0x2626...81 : 0x414bf389"
///
/// Enforcement (preCheck) is unchanged — raw addresses, no extra gas.
/// ENS is a write-time verification and read-time audit layer.
///
/// Module type: Hook (4)
contract PolicyHookENS is PolicyHookRuleSpend, IPolicyHookENS {
    // -------------------------------------------------------------------------
    // Storage
    // -------------------------------------------------------------------------

    /// @dev ENS registry address. address(0) = on-chain verification disabled.
    address public immutable override ensRegistry;

    /// @dev ENS namehash stored per (account, target) pair.
    mapping(address account => mapping(address target => bytes32)) private _ensLabels;

    /// @dev Verification timestamp per (account, target) pair.
    mapping(address account => mapping(address target => uint48)) private _ensVerifiedAt;

    /// @dev Targets with ENS labels per account (for enumeration in audit).
    mapping(address account => address[]) private _ensLabeledTargets;

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /// @param _registry ENS registry address. Pass address(0) on chains without
    ///                  ENS to store labels as metadata-only (namehash still
    ///                  useful for off-chain verification).
    constructor(address _registry) {
        ensRegistry = _registry;
    }

    // -------------------------------------------------------------------------
    // ENS-aware policy creation
    // -------------------------------------------------------------------------

    /// @inheritdoc IPolicyHookENS
    function addWhitelistEntryWithENS(
        address target,
        bytes4  selector,
        bytes32 ensNode
    ) external override {
        address account = msg.sender;
        _verifyAndStoreENS(account, target, ensNode);
        _addWhitelistEntry(account, target, selector);
    }

    /// @inheritdoc IPolicyHookENS
    function addEqRuleWithSpendAndENS(
        address target,
        bytes4  selector,
        EqCondition[] calldata conditions,
        SpendRuleConfig calldata spend,
        bytes32 ensNode
    ) external override returns (bytes32 ruleId) {
        _verifyAndStoreENS(msg.sender, target, ensNode);
        ruleId = _addRule(target, selector, conditions, spend);
    }

    // -------------------------------------------------------------------------
    // ENS audit & verification
    // -------------------------------------------------------------------------

    /// @inheritdoc IPolicyHookENS
    function getENSLabel(
        address account,
        address target
    ) external view override returns (ENSLabel memory) {
        return ENSLabel({
            ensNode:    _ensLabels[account][target],
            verifiedAt: _ensVerifiedAt[account][target]
        });
    }

    /// @inheritdoc IPolicyHookENS
    function verifyENSTarget(
        address account,
        address target
    ) external view override returns (bool valid, address currentAddr) {
        bytes32 node = _ensLabels[account][target];
        if (node == bytes32(0)) return (false, address(0));

        currentAddr = ENSVerifier.resolve(ensRegistry, node);
        valid = (currentAddr == target);
    }

    /// @inheritdoc IPolicyHookENS
    function auditENSLabels(
        address account
    ) external view override returns (ENSDrift[] memory drifts) {
        address[] storage targets = _ensLabeledTargets[account];
        uint256 total = targets.length;

        // First pass: count drifted entries.
        uint256 driftCount;
        for (uint256 i; i < total; ++i) {
            bytes32 node = _ensLabels[account][targets[i]];
            if (node == bytes32(0)) continue;
            address current = ENSVerifier.resolve(ensRegistry, node);
            if (current != targets[i]) ++driftCount;
        }

        // Second pass: build results.
        drifts = new ENSDrift[](driftCount);
        uint256 j;
        for (uint256 i; i < total; ++i) {
            address target = targets[i];
            bytes32 node = _ensLabels[account][target];
            if (node == bytes32(0)) continue;

            address current = ENSVerifier.resolve(ensRegistry, node);
            if (current != target) {
                drifts[j++] = ENSDrift({
                    target:      target,
                    ensNode:     node,
                    storedAddr:  target,
                    currentAddr: current
                });
            }
        }
    }

    // -------------------------------------------------------------------------
    // Extended views
    // -------------------------------------------------------------------------

    /// @inheritdoc IPolicyHookENS
    function getPolicySnapshotWithENS(
        address account
    ) external view override returns (PolicySnapshotENS memory snapshot) {
        snapshot.config           = _policy[account];
        snapshot.whitelistEntries = _getWhitelistEntriesENS(account);
        snapshot.spendLimits      = _getSpendLimits(account);
        snapshot.rules            = _getActiveRulesENS(account);
    }

    // -------------------------------------------------------------------------
    // Internal
    // -------------------------------------------------------------------------

    /// @dev Verifies ENS resolution (if registry set) and stores the label.
    function _verifyAndStoreENS(
        address account,
        address target,
        bytes32 ensNode
    ) internal {
        if (ensNode == bytes32(0)) return;

        // On-chain verification when registry is available.
        if (ensRegistry != address(0)) {
            address resolved = ENSVerifier.resolve(ensRegistry, ensNode);
            if (resolved == address(0)) revert ENSNotResolvable(ensNode);
            if (resolved != target) revert ENSResolutionMismatch(ensNode, target, resolved);
        }

        // Store the label. If target already has a label, overwrite it.
        bool isNew = _ensLabels[account][target] == bytes32(0);
        _ensLabels[account][target] = ensNode;
        _ensVerifiedAt[account][target] = uint48(block.timestamp);

        if (isNew) {
            _ensLabeledTargets[account].push(target);
        }

        emit ENSLabelStored(account, target, ensNode, uint48(block.timestamp));
    }

    // ── Private view helpers ────────────────────────────────────────────────

    function _getWhitelistEntriesENS(address account)
        private view returns (WhitelistEntryViewENS[] memory)
    {
        WhitelistEntryIndex[] storage index = _whitelistIndex[account];
        uint256 total = index.length;

        uint256 active;
        for (uint256 i; i < total; ++i) {
            bytes32 key = PolicyTypes.whitelistKey(index[i].target, index[i].selector);
            if (_whitelist[account][key]) ++active;
        }

        WhitelistEntryViewENS[] memory result = new WhitelistEntryViewENS[](active);
        uint256 j;
        for (uint256 i; i < total; ++i) {
            bytes32 key = PolicyTypes.whitelistKey(index[i].target, index[i].selector);
            if (_whitelist[account][key]) {
                result[j++] = WhitelistEntryViewENS({
                    target:   index[i].target,
                    selector: index[i].selector,
                    ensNode:  _ensLabels[account][index[i].target]
                });
            }
        }
        return result;
    }

    function _getActiveRulesENS(address account)
        private view returns (RuleViewENS[] memory)
    {
        bytes32[] storage allIds = _allRuleIds[account];
        uint256 total = allIds.length;

        uint256 active;
        for (uint256 i; i < total; ++i) {
            if (_eqRules[account][allIds[i]].active) ++active;
        }

        RuleViewENS[] memory result = new RuleViewENS[](active);
        uint256 j;
        for (uint256 i; i < total; ++i) {
            bytes32 ruleId = allIds[i];
            StoredEqRule storage r = _eqRules[account][ruleId];
            if (!r.active) continue;

            uint256 condLen = r.conditions.length;
            EqCondition[] memory conds = new EqCondition[](condLen);
            for (uint256 k; k < condLen; ++k) {
                conds[k] = r.conditions[k];
            }

            result[j++] = RuleViewENS({
                ruleId:          ruleId,
                target:          r.target,
                selector:        r.selector,
                ensNode:         _ensLabels[account][r.target],
                conditions:      conds,
                spendParamIndex: r.spendParamIndex,
                maxPerPeriod:    r.maxPerPeriod,
                periodDuration:  r.periodDuration,
                spentInPeriod:   r.spentInPeriod,
                periodStart:     r.periodStart
            });
        }
        return result;
    }
}

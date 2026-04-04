// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { IPolicyHookRuleSpend } from "../interfaces/IPolicyHookRuleSpend.sol";
import { IPolicyHookEq } from "../interfaces/IPolicyHookEq.sol";
import { PolicyTypes } from "../types/PolicyTypes.sol";
import {
    ModeCode,
    ModeCodeLib,
    ExecutionDecoder,
    Execution
} from "../types/ExecutionTypes.sol";
import { WhitelistLib } from "../libs/WhitelistLib.sol";
import { SpendLimitLib } from "../libs/SpendLimitLib.sol";
import { ERC20SpendDecoder } from "../libs/ERC20SpendDecoder.sol";

/// @notice Policy hook with per-rule spend limits.
///
/// Extends PolicyHookEq's equality rule system by allowing each rule to carry
/// its own rolling spend window tracking a specific ABI word as an amount.
///
/// Permission check order for every call:
///   1. Paused / delegatecall / privileged selector checks
///   2. Rule matching:
///      a. If EqRules exist for (target, selector): at least one must match
///      b. Else: (target, selector) must be in the coarse whitelist
///   3. Per-rule spend limit (if configured on the matched rule)
///   4. Global per-token spend limit (ERC-20 transfer/approve/transferFrom)
///   5. Native value cap
///
/// Module type: Hook (4)
/// Storage: per-account, keyed by msg.sender
contract PolicyHookRuleSpend is IPolicyHookRuleSpend {
    using ModeCodeLib for ModeCode;

    // Sentinel: spendParamIndex == 255 means no per-rule spend tracking.
    uint8 internal constant SPEND_DISABLED = type(uint8).max;

    // -------------------------------------------------------------------------
    // Storage
    // -------------------------------------------------------------------------

    struct StoredEqRule {
        address target;
        bytes4  selector;
        bool    active;
        EqCondition[] conditions;
        // Per-rule spend tracking
        uint8   spendParamIndex;  // SPEND_DISABLED = tracking off
        uint256 maxPerPeriod;
        uint256 periodDuration;
        uint256 spentInPeriod;
        uint256 periodStart;
    }

    mapping(address account => mapping(bytes32 key => bool))           internal _whitelist;
    mapping(address account => mapping(address token => SpendLimit))   internal _spendLimits;
    mapping(address account => PolicyConfig)                           internal _policy;
    mapping(address account => bool)                                   internal _initialized;

    mapping(address account => mapping(bytes32 ruleId => StoredEqRule))  internal _eqRules;
    mapping(address account => mapping(bytes32 ruleId => bool))          internal _eqRuleKnown;
    mapping(address account => mapping(bytes32 wlKey  => bytes32[]))     internal _eqRuleIdsByKey;

    // Enumeration indexes — used by the UI to list all configured rules/entries.
    // Whitelist entries: array of (target, selector) pairs per account.
    struct WhitelistEntryIndex { address target; bytes4 selector; }
    mapping(address account => WhitelistEntryIndex[]) internal _whitelistIndex;
    // Spend limit token list per account.
    mapping(address account => address[])   internal _spendLimitTokens;
    // All ruleIds ever added per account (includes removed ones — check active flag).
    mapping(address account => bytes32[])   internal _allRuleIds;

    // -------------------------------------------------------------------------
    // IERC7579Module
    // -------------------------------------------------------------------------

    function onInstall(bytes calldata initData) external override {
        address account = msg.sender;
        _initialized[account] = true;
        if (initData.length >= 32) {
            _policy[account].nativeValueCapPerTx = abi.decode(initData, (uint256));
        }
    }

    function onUninstall(bytes calldata) external override {
        address account = msg.sender;
        delete _policy[account];
        delete _initialized[account];
    }

    function isModuleType(uint256 moduleTypeId) external pure override returns (bool) {
        return moduleTypeId == PolicyTypes.MODULE_TYPE_HOOK;
    }

    function isInitialized(address smartAccount) external view override returns (bool) {
        return _initialized[smartAccount];
    }

    // -------------------------------------------------------------------------
    // IERC7579Hook
    // -------------------------------------------------------------------------

    function preCheck(
        address,
        uint256 msgValue,
        bytes calldata msgData
    ) external override returns (bytes memory) {
        address account = msg.sender;
        PolicyConfig storage policy = _policy[account];

        if (policy.paused) revert PolicyPaused(account);
        if (msgData.length < 100) return "";

        ModeCode mode = ModeCode.wrap(bytes32(msgData[4:36]));
        if (mode.isDelegatecall()) revert DelegatecallBlocked();

        uint256 execLen = uint256(bytes32(msgData[68:100]));
        if (msgData.length < 100 + execLen) return "";

        bytes calldata executionCalldata = msgData[100:100 + execLen];

        if (mode.isBatch()) {
            _checkBatch(account, executionCalldata, policy);
        } else {
            _checkSingle(account, msgValue, executionCalldata, policy);
        }

        return "";
    }

    function postCheck(bytes calldata) external override {}

    // -------------------------------------------------------------------------
    // IPolicyHook — whitelist management
    // -------------------------------------------------------------------------

    function addWhitelistEntry(address target, bytes4 selector) external override {
        _addWhitelistEntry(msg.sender, target, selector);
    }

    function _addWhitelistEntry(address account, address target, bytes4 selector) internal {
        bytes32 key = PolicyTypes.whitelistKey(target, selector);
        if (_whitelist[account][key]) revert EntryAlreadyExists(target, selector);
        _whitelist[account][key] = true;
        _whitelistIndex[account].push(WhitelistEntryIndex({ target: target, selector: selector }));
        emit WhitelistEntryAdded(account, target, selector);
    }

    function removeWhitelistEntry(address target, bytes4 selector) external override {
        address account = msg.sender;
        bytes32 key = PolicyTypes.whitelistKey(target, selector);
        if (!_whitelist[account][key]) revert EntryNotFound(target, selector);
        _whitelist[account][key] = false;
        emit WhitelistEntryRemoved(account, target, selector);
    }

    function isWhitelisted(
        address account,
        address target,
        bytes4 selector
    ) external view override returns (bool) {
        return WhitelistLib.isAllowed(_whitelist[account], target, selector);
    }

    function setSpendLimit(
        address token,
        uint256 maxPerPeriod,
        uint256 periodDuration
    ) external override {
        address account = msg.sender;
        SpendLimit storage sl = _spendLimits[account][token];
        bool isNew = sl.periodStart == 0;
        sl.token          = token;
        sl.maxPerPeriod   = maxPerPeriod;
        sl.periodDuration = periodDuration;
        if (isNew) {
            sl.periodStart = block.timestamp;
            _spendLimitTokens[account].push(token);
        }
        emit SpendLimitSet(account, token, maxPerPeriod, periodDuration);
    }

    function removeSpendLimit(address token) external override {
        address account = msg.sender;
        delete _spendLimits[account][token];
        emit SpendLimitRemoved(account, token);
    }

    function getSpendLimit(
        address account,
        address token
    ) external view override returns (SpendLimit memory) {
        return _spendLimits[account][token];
    }

    function setNativeValueCap(uint256 cap) external override {
        address account = msg.sender;
        _policy[account].nativeValueCapPerTx = cap;
        emit NativeValueCapSet(account, cap);
    }

    function pause() external override {
        _policy[msg.sender].paused = true;
        emit AccountPaused(msg.sender);
    }

    function unpause() external override {
        _policy[msg.sender].paused = false;
        emit AccountUnpaused(msg.sender);
    }

    function getPolicy(address account) external view override returns (PolicyConfig memory) {
        return _policy[account];
    }

    // -------------------------------------------------------------------------
    // IPolicyHookEq — equality rules (no spend tracking)
    // -------------------------------------------------------------------------

    function addEqRule(
        address target,
        bytes4 selector,
        EqCondition[] calldata conditions
    ) external override returns (bytes32 ruleId) {
        return _addRule(
            target,
            selector,
            conditions,
            SpendRuleConfig({ spendParamIndex: SPEND_DISABLED, maxPerPeriod: 0, periodDuration: 0 })
        );
    }

    function removeEqRule(bytes32 ruleId) external override {
        address account = msg.sender;
        if (!_eqRules[account][ruleId].active) revert EqRuleNotFound(ruleId);
        delete _eqRules[account][ruleId];
        emit EqRuleRemoved(account, ruleId);
    }

    function getEqRule(
        address account,
        bytes32 ruleId
    ) external view override returns (EqRule memory rule, EqCondition[] memory conditions) {
        StoredEqRule storage stored = _eqRules[account][ruleId];
        rule = EqRule({
            target:         stored.target,
            selector:       stored.selector,
            active:         stored.active,
            conditionCount: stored.conditions.length
        });
        uint256 len = stored.conditions.length;
        conditions = new EqCondition[](len);
        for (uint256 i; i < len; ++i) {
            conditions[i] = stored.conditions[i];
        }
    }

    function hasEqRules(
        address account,
        address target,
        bytes4 selector
    ) external view override returns (bool) {
        return _hasActiveEqRules(account, target, selector);
    }

    function computeEqRuleId(
        address target,
        bytes4 selector,
        EqCondition[] calldata conditions
    ) external pure override returns (bytes32) {
        return _computeRuleId(target, selector, conditions);
    }

    // -------------------------------------------------------------------------
    // IPolicyHookRuleSpend — equality rules WITH per-rule spend limits
    // -------------------------------------------------------------------------

    function addEqRuleWithSpend(
        address target,
        bytes4 selector,
        EqCondition[] calldata conditions,
        SpendRuleConfig calldata spend
    ) external override returns (bytes32 ruleId) {
        return _addRule(target, selector, conditions, spend);
    }

    function getRuleSpendState(
        address account,
        bytes32 ruleId
    ) external view override returns (RuleSpendState memory) {
        StoredEqRule storage r = _eqRules[account][ruleId];
        return RuleSpendState({
            spendParamIndex: r.spendParamIndex,
            maxPerPeriod:    r.maxPerPeriod,
            periodDuration:  r.periodDuration,
            spentInPeriod:   r.spentInPeriod,
            periodStart:     r.periodStart
        });
    }

    // -------------------------------------------------------------------------
    // Internal — rule management
    // -------------------------------------------------------------------------

    function _addRule(
        address target,
        bytes4 selector,
        EqCondition[] calldata conditions,
        SpendRuleConfig memory spend
    ) internal returns (bytes32 ruleId) {
        if (selector == PolicyTypes.WILDCARD_SELECTOR) revert WildcardEqRuleUnsupported();
        _validateConditions(conditions);

        address account = msg.sender;
        ruleId = _computeRuleId(target, selector, conditions);

        StoredEqRule storage rule = _eqRules[account][ruleId];
        if (rule.active) revert EqRuleAlreadyExists(ruleId);

        // Register in the by-key index (once per ruleId, even if removed and re-added).
        if (!_eqRuleKnown[account][ruleId]) {
            bytes32 key = PolicyTypes.whitelistKey(target, selector);
            _eqRuleIdsByKey[account][key].push(ruleId);
            _allRuleIds[account].push(ruleId);
            _eqRuleKnown[account][ruleId] = true;
        }

        rule.target   = target;
        rule.selector = selector;
        rule.active   = true;

        uint256 len = conditions.length;
        for (uint256 i; i < len; ++i) {
            rule.conditions.push(conditions[i]);
        }

        // Per-rule spend config.
        rule.spendParamIndex = spend.spendParamIndex;
        if (spend.spendParamIndex != SPEND_DISABLED) {
            if (spend.periodDuration == 0) revert RuleSpendInvalidPeriod();
            rule.maxPerPeriod   = spend.maxPerPeriod;
            rule.periodDuration = spend.periodDuration;
            rule.periodStart    = block.timestamp;

            emit RuleSpendLimitSet(
                account,
                ruleId,
                spend.spendParamIndex,
                spend.maxPerPeriod,
                spend.periodDuration
            );
        }

        emit EqRuleAdded(account, ruleId, target, selector);
    }

    // -------------------------------------------------------------------------
    // Internal — call checking
    // -------------------------------------------------------------------------

    function _checkSingle(
        address account,
        uint256 msgValue,
        bytes calldata executionCalldata,
        PolicyConfig storage policy
    ) internal {
        (address target, uint256 callValue, bytes calldata callData) =
            ExecutionDecoder.decodeSingle(executionCalldata);
        uint256 nativeValue = callValue > 0 ? callValue : msgValue;
        _checkCall(account, target, nativeValue, callData, policy);
    }

    function _checkBatch(
        address account,
        bytes calldata executionCalldata,
        PolicyConfig storage policy
    ) internal {
        Execution[] calldata executions = ExecutionDecoder.decodeBatch(executionCalldata);
        for (uint256 i; i < executions.length; ++i) {
            _checkCall(
                account,
                executions[i].target,
                executions[i].value,
                executions[i].callData,
                policy
            );
        }
    }

    function _checkCall(
        address account,
        address target,
        uint256 value,
        bytes calldata callData,
        PolicyConfig storage policy
    ) internal {
        bytes4 selector = callData.length >= 4 ? bytes4(callData[:4]) : bytes4(0);

        // Block privileged account-management selectors unconditionally.
        if (PolicyTypes.isPrivilegedSelector(selector)) {
            revert PrivilegedCallBlocked(target, selector);
        }

        // ── Rule matching ─────────────────────────────────────────────────────
        // Try to match an active EqRule. If rules exist for this (target, selector),
        // at least one must match. If none exist, fall back to the coarse whitelist.
        (bool hasRules, bool matched, bytes32 matchedRuleId) =
            _matchEqRule(account, target, selector, callData);

        if (hasRules) {
            if (!matched) revert EqRuleNotSatisfied(target, selector);

            // ── Per-rule spend limit ──────────────────────────────────────────
            StoredEqRule storage rule = _eqRules[account][matchedRuleId];
            if (rule.spendParamIndex != SPEND_DISABLED) {
                _checkRuleSpend(rule, matchedRuleId, callData);
            }
        } else {
            if (!WhitelistLib.isAllowed(_whitelist[account], target, selector)) {
                revert NotWhitelisted(target, selector);
            }
        }

        // ── Native value cap ──────────────────────────────────────────────────
        if (policy.nativeValueCapPerTx > 0 && value > policy.nativeValueCapPerTx) {
            revert NativeValueCapExceeded(value, policy.nativeValueCapPerTx);
        }

        // ── Global per-token ERC-20 spend limit ───────────────────────────────
        // Tracks transfer / approve / transferFrom regardless of rule matching.
        if (callData.length >= 4 && ERC20SpendDecoder.isSpendSelector(selector)) {
            uint256 amount = ERC20SpendDecoder.decodeSpendAmount(selector, callData[4:]);
            if (amount > 0) {
                SpendLimitLib.checkAndAccumulate(_spendLimits[account][target], amount);
            }
        }
    }

    /// @dev Decodes the amount word at rule.spendParamIndex and enforces the
    ///      rule's rolling window. Mutates storage on the matched rule directly.
    function _checkRuleSpend(
        StoredEqRule storage rule,
        bytes32 ruleId,
        bytes calldata callData
    ) internal {
        // Byte range of the amount word: 4 (selector) + paramIndex * 32
        uint256 start = 4 + uint256(rule.spendParamIndex) * 32;
        uint256 end   = start + 32;

        if (callData.length < end) {
            revert RuleSpendCalldataTooShort(ruleId, end, callData.length);
        }

        uint256 amount = uint256(bytes32(callData[start:end]));

        // Reset window if expired.
        if (rule.periodDuration > 0 &&
            block.timestamp >= rule.periodStart + rule.periodDuration)
        {
            rule.spentInPeriod = 0;
            rule.periodStart   = block.timestamp;
        }

        uint256 newSpent = rule.spentInPeriod + amount;
        if (newSpent > rule.maxPerPeriod) {
            uint256 remaining = rule.maxPerPeriod - rule.spentInPeriod;
            revert RuleSpendLimitExceeded(ruleId, amount, remaining);
        }

        rule.spentInPeriod = newSpent;
    }

    // -------------------------------------------------------------------------
    // Internal — rule matching
    // -------------------------------------------------------------------------

    /// @dev Returns (hasRules, matched, matchedRuleId).
    ///      hasRules  — at least one active rule exists for (target, selector)
    ///      matched   — at least one active rule's conditions all passed
    ///      matchedRuleId — the first matching ruleId (zero if none matched)
    function _matchEqRule(
        address account,
        address target,
        bytes4 selector,
        bytes calldata callData
    ) internal view returns (bool hasRules, bool matched, bytes32 matchedRuleId) {
        bytes32 key = PolicyTypes.whitelistKey(target, selector);
        bytes32[] storage ruleIds = _eqRuleIdsByKey[account][key];
        uint256 len = ruleIds.length;

        for (uint256 i; i < len; ++i) {
            StoredEqRule storage rule = _eqRules[account][ruleIds[i]];
            if (!rule.active) continue;

            hasRules = true;
            if (_conditionsMatch(rule, callData)) {
                return (true, true, ruleIds[i]);
            }
        }
    }

    function _conditionsMatch(
        StoredEqRule storage rule,
        bytes calldata callData
    ) internal view returns (bool) {
        uint256 len = rule.conditions.length;
        for (uint256 i; i < len; ++i) {
            uint256 start = 4 + uint256(rule.conditions[i].paramIndex) * 32;
            uint256 end   = start + 32;
            if (callData.length < end) return false;
            if (bytes32(callData[start:end]) != rule.conditions[i].expectedValue) return false;
        }
        return true;
    }

    function _hasActiveEqRules(
        address account,
        address target,
        bytes4 selector
    ) internal view returns (bool) {
        bytes32 key = PolicyTypes.whitelistKey(target, selector);
        bytes32[] storage ruleIds = _eqRuleIdsByKey[account][key];
        uint256 len = ruleIds.length;
        for (uint256 i; i < len; ++i) {
            if (_eqRules[account][ruleIds[i]].active) return true;
        }
        return false;
    }

    // -------------------------------------------------------------------------
    // Internal — helpers
    // -------------------------------------------------------------------------

    function _validateConditions(EqCondition[] calldata conditions) internal pure {
        uint256 len = conditions.length;
        for (uint256 i = 1; i < len; ++i) {
            if (conditions[i - 1].paramIndex >= conditions[i].paramIndex) {
                revert EqConditionsUnsorted();
            }
        }
    }

    function _computeRuleId(
        address target,
        bytes4 selector,
        EqCondition[] calldata conditions
    ) internal pure returns (bytes32) {
        return keccak256(abi.encode(target, selector, conditions));
    }

    // -------------------------------------------------------------------------
    // Enumeration views — used by the UI to list all configured policy state
    // -------------------------------------------------------------------------

    /// @notice Returns the complete policy state for an account in one call.
    /// @dev Designed for UI consumption. Does NOT paginate — only suitable for
    ///      accounts with a reasonable number of rules (< a few hundred).
    function getPolicySnapshot(address account) external view returns (PolicySnapshot memory snapshot) {
        snapshot.config = _policy[account];
        snapshot.whitelistEntries = _getActiveWhitelistEntries(account);
        snapshot.spendLimits      = _getSpendLimits(account);
        snapshot.rules            = _getActiveRules(account);
    }

    /// @notice Returns all active coarse-whitelist entries for an account.
    function getWhitelistEntries(address account) external view returns (WhitelistEntryView[] memory) {
        return _getActiveWhitelistEntries(account);
    }

    /// @notice Returns all configured global spend limits for an account.
    function getSpendLimits(address account) external view returns (SpendLimitView[] memory) {
        return _getSpendLimits(account);
    }

    /// @notice Returns all active rules (with conditions and spend state) for an account.
    function getRules(address account) external view returns (RuleView[] memory) {
        return _getActiveRules(account);
    }

    // ── private helpers ───────────────────────────────────────────────────────

    function _getActiveWhitelistEntries(address account)
        internal view returns (WhitelistEntryView[] memory)
    {
        WhitelistEntryIndex[] storage index = _whitelistIndex[account];
        uint256 total = index.length;

        // Count active entries (removed entries have their bool set to false).
        uint256 active;
        for (uint256 i; i < total; ++i) {
            bytes32 key = PolicyTypes.whitelistKey(index[i].target, index[i].selector);
            if (_whitelist[account][key]) ++active;
        }

        WhitelistEntryView[] memory result = new WhitelistEntryView[](active);
        uint256 j;
        for (uint256 i; i < total; ++i) {
            bytes32 key = PolicyTypes.whitelistKey(index[i].target, index[i].selector);
            if (_whitelist[account][key]) {
                result[j++] = WhitelistEntryView({
                    target:   index[i].target,
                    selector: index[i].selector
                });
            }
        }
        return result;
    }

    function _getSpendLimits(address account)
        internal view returns (SpendLimitView[] memory)
    {
        address[] storage tokens = _spendLimitTokens[account];
        uint256 total = tokens.length;

        // Count tokens that still have an active limit (maxPerPeriod > 0).
        uint256 active;
        for (uint256 i; i < total; ++i) {
            if (_spendLimits[account][tokens[i]].maxPerPeriod > 0) ++active;
        }

        SpendLimitView[] memory result = new SpendLimitView[](active);
        uint256 j;
        for (uint256 i; i < total; ++i) {
            SpendLimit storage sl = _spendLimits[account][tokens[i]];
            if (sl.maxPerPeriod > 0) {
                result[j++] = SpendLimitView({
                    token:          tokens[i],
                    maxPerPeriod:   sl.maxPerPeriod,
                    periodDuration: sl.periodDuration,
                    spentInPeriod:  sl.spentInPeriod,
                    periodStart:    sl.periodStart
                });
            }
        }
        return result;
    }

    function _getActiveRules(address account)
        internal view returns (RuleView[] memory)
    {
        bytes32[] storage allIds = _allRuleIds[account];
        uint256 total = allIds.length;

        uint256 active;
        for (uint256 i; i < total; ++i) {
            if (_eqRules[account][allIds[i]].active) ++active;
        }

        RuleView[] memory result = new RuleView[](active);
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

            result[j++] = RuleView({
                ruleId:         ruleId,
                target:         r.target,
                selector:       r.selector,
                conditions:     conds,
                spendParamIndex: r.spendParamIndex,
                maxPerPeriod:   r.maxPerPeriod,
                periodDuration: r.periodDuration,
                spentInPeriod:  r.spentInPeriod,
                periodStart:    r.periodStart
            });
        }
        return result;
    }
}

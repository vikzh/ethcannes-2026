// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

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

/// @notice Policy hook variant that supports exact-match rules on ABI words.
/// @dev Equality rules are evaluated only for exact (target, selector) matches.
///      If at least one equality rule exists for a tuple, one of those rules must
///      match the calldata. Otherwise, the hook falls back to the coarse whitelist.
contract PolicyHookEq is IPolicyHookEq {
    using ModeCodeLib for ModeCode;

    struct StoredEqRule {
        address target;
        bytes4 selector;
        bool active;
        EqCondition[] conditions;
    }

    mapping(address account => mapping(bytes32 key => bool)) private _whitelist;
    mapping(address account => mapping(address token => SpendLimit)) private _spendLimits;
    mapping(address account => PolicyConfig) private _policy;
    mapping(address account => bool) private _initialized;

    mapping(address account => mapping(bytes32 ruleId => StoredEqRule rule)) private _eqRules;
    mapping(address account => mapping(bytes32 ruleId => bool known)) private _eqRuleKnown;
    mapping(address account => mapping(bytes32 whitelistKey => bytes32[] ruleIds)) private _eqRuleIdsByKey;

    /// @param initData abi.encode(uint256 nativeValueCapPerTx) — pass 0 for no cap
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

    function preCheck(
        address, /* msgSender */
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

    function addWhitelistEntry(address target, bytes4 selector) external override {
        address account = msg.sender;
        bytes32 key = PolicyTypes.whitelistKey(target, selector);
        if (_whitelist[account][key]) revert EntryAlreadyExists(target, selector);
        _whitelist[account][key] = true;
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
        sl.token = token;
        sl.maxPerPeriod = maxPerPeriod;
        sl.periodDuration = periodDuration;
        if (sl.periodStart == 0) sl.periodStart = block.timestamp;
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

    function addEqRule(
        address target,
        bytes4 selector,
        EqCondition[] calldata conditions
    ) external override returns (bytes32 ruleId) {
        if (selector == PolicyTypes.WILDCARD_SELECTOR) revert WildcardEqRuleUnsupported();
        _validateConditions(conditions);

        address account = msg.sender;
        ruleId = _computeEqRuleId(target, selector, conditions);

        StoredEqRule storage rule = _eqRules[account][ruleId];
        if (rule.active) revert EqRuleAlreadyExists(ruleId);

        if (!_eqRuleKnown[account][ruleId]) {
            bytes32 key = PolicyTypes.whitelistKey(target, selector);
            _eqRuleIdsByKey[account][key].push(ruleId);
            _eqRuleKnown[account][ruleId] = true;
        }

        rule.target = target;
        rule.selector = selector;
        rule.active = true;

        uint256 length = conditions.length;
        for (uint256 i; i < length; ++i) {
            rule.conditions.push(conditions[i]);
        }

        emit EqRuleAdded(account, ruleId, target, selector);
    }

    function removeEqRule(bytes32 ruleId) external override {
        address account = msg.sender;
        StoredEqRule storage rule = _eqRules[account][ruleId];
        if (!rule.active) revert EqRuleNotFound(ruleId);

        delete _eqRules[account][ruleId];
        emit EqRuleRemoved(account, ruleId);
    }

    function getEqRule(
        address account,
        bytes32 ruleId
    ) external view override returns (EqRule memory rule, EqCondition[] memory conditions) {
        StoredEqRule storage stored = _eqRules[account][ruleId];
        rule = EqRule({
            target: stored.target,
            selector: stored.selector,
            active: stored.active,
            conditionCount: stored.conditions.length
        });

        uint256 length = stored.conditions.length;
        conditions = new EqCondition[](length);
        for (uint256 i; i < length; ++i) {
            conditions[i] = stored.conditions[i];
        }
    }

    function hasEqRules(
        address account,
        address target,
        bytes4 selector
    ) external view override returns (bool) {
        return _hasEqRules(account, target, selector);
    }

    function computeEqRuleId(
        address target,
        bytes4 selector,
        EqCondition[] calldata conditions
    ) external pure override returns (bytes32 ruleId) {
        return _computeEqRuleId(target, selector, conditions);
    }

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

        if (PolicyTypes.isPrivilegedSelector(selector)) {
            revert PrivilegedCallBlocked(target, selector);
        }

        (bool hasExactEqRules, bool matchedExactEqRule) = _matchEqRule(account, target, selector, callData);
        if (hasExactEqRules) {
            if (!matchedExactEqRule) revert EqRuleNotSatisfied(target, selector);
        } else if (!WhitelistLib.isAllowed(_whitelist[account], target, selector)) {
            revert NotWhitelisted(target, selector);
        }

        if (policy.nativeValueCapPerTx > 0 && value > policy.nativeValueCapPerTx) {
            revert NativeValueCapExceeded(value, policy.nativeValueCapPerTx);
        }

        if (callData.length >= 4 && ERC20SpendDecoder.isSpendSelector(selector)) {
            uint256 amount = ERC20SpendDecoder.decodeSpendAmount(selector, callData[4:]);
            if (amount > 0) {
                SpendLimitLib.checkAndAccumulate(_spendLimits[account][target], amount);
            }
        }
    }

    function _matchEqRule(
        address account,
        address target,
        bytes4 selector,
        bytes calldata callData
    ) internal view returns (bool hasRules, bool matchedRule) {
        bytes32 key = PolicyTypes.whitelistKey(target, selector);
        bytes32[] storage ruleIds = _eqRuleIdsByKey[account][key];
        uint256 length = ruleIds.length;

        for (uint256 i; i < length; ++i) {
            StoredEqRule storage rule = _eqRules[account][ruleIds[i]];
            if (!rule.active) continue;

            hasRules = true;
            if (_matchesEqRule(rule, callData)) {
                return (true, true);
            }
        }
    }

    function _matchesEqRule(
        StoredEqRule storage rule,
        bytes calldata callData
    ) internal view returns (bool) {
        uint256 length = rule.conditions.length;

        for (uint256 i; i < length; ++i) {
            EqCondition storage condition = rule.conditions[i];
            uint256 start = 4 + (uint256(condition.paramIndex) * 32);
            uint256 end = start + 32;
            if (callData.length < end) return false;

            bytes32 actual = bytes32(callData[start:end]);
            if (actual != condition.expectedValue) return false;
        }

        return true;
    }

    function _hasEqRules(
        address account,
        address target,
        bytes4 selector
    ) internal view returns (bool) {
        bytes32 key = PolicyTypes.whitelistKey(target, selector);
        bytes32[] storage ruleIds = _eqRuleIdsByKey[account][key];
        uint256 length = ruleIds.length;

        for (uint256 i; i < length; ++i) {
            if (_eqRules[account][ruleIds[i]].active) return true;
        }

        return false;
    }

    function _validateConditions(EqCondition[] calldata conditions) internal pure {
        uint256 length = conditions.length;
        for (uint256 i = 1; i < length; ++i) {
            if (conditions[i - 1].paramIndex >= conditions[i].paramIndex) {
                revert EqConditionsUnsorted();
            }
        }
    }

    function _computeEqRuleId(
        address target,
        bytes4 selector,
        EqCondition[] calldata conditions
    ) internal pure returns (bytes32 ruleId) {
        return keccak256(abi.encode(target, selector, conditions));
    }
}

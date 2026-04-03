// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { IPolicyHook } from "../interfaces/IPolicyHook.sol";
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

/// @notice Policy hook module.
/// Enforces (address, selector) whitelists, spend limits, native value caps,
/// and delegatecall blocking as an ERC-7579 execution hook (type 4).
///
/// preCheck decodes the raw calldata of the account's execute(ModeCode, bytes) call,
/// validates every sub-call, and accumulates spend. postCheck is a no-op in MVP.
///
/// Storage: all state keyed by msg.sender (= the smart account address).
contract PolicyHook is IPolicyHook {
    using ModeCodeLib for ModeCode;

    // per-account whitelist: whitelistKey => active
    mapping(address account => mapping(bytes32 key => bool)) private _whitelist;

    // per-account, per-token spend limits
    mapping(address account => mapping(address token => SpendLimit)) private _spendLimits;

    // per-account policy config
    mapping(address account => PolicyConfig) private _policy;

    // tracks which accounts have called onInstall
    mapping(address account => bool) private _initialized;

    // -------------------------------------------------------------------------
    // IERC7579Module
    // -------------------------------------------------------------------------

    /// @param initData abi.encode(uint256 nativeValueCapPerTx)  — pass 0 for no cap
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

    /// @notice Decodes the account's execute calldata and validates every sub-call.
    /// @dev msgData layout for execute(ModeCode mode, bytes calldata executionCalldata):
    ///        [0:4]    function selector
    ///        [4:36]   ModeCode (bytes32)
    ///        [36:68]  ABI offset to bytes param (= 0x40 = 64)
    ///        [68:100] length of executionCalldata
    ///        [100:]   executionCalldata bytes
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

    /// @dev No-op in MVP — all enforcement is in preCheck.
    function postCheck(bytes calldata) external override {}

    // -------------------------------------------------------------------------
    // Whitelist management (msg.sender == account)
    // -------------------------------------------------------------------------

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

    // -------------------------------------------------------------------------
    // Spend limits (msg.sender == account)
    // -------------------------------------------------------------------------

    function setSpendLimit(
        address token,
        uint256 maxPerPeriod,
        uint256 periodDuration
    ) external override {
        address account = msg.sender;
        SpendLimit storage sl = _spendLimits[account][token];
        sl.token          = token;
        sl.maxPerPeriod   = maxPerPeriod;
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

    // -------------------------------------------------------------------------
    // Native value cap (msg.sender == account)
    // -------------------------------------------------------------------------

    function setNativeValueCap(uint256 cap) external override {
        address account = msg.sender;
        _policy[account].nativeValueCapPerTx = cap;
        emit NativeValueCapSet(account, cap);
    }

    // -------------------------------------------------------------------------
    // Pause controls (msg.sender == account or EmergencyControls module)
    // -------------------------------------------------------------------------

    function pause() external override {
        _policy[msg.sender].paused = true;
        emit AccountPaused(msg.sender);
    }

    function unpause() external override {
        _policy[msg.sender].paused = false;
        emit AccountUnpaused(msg.sender);
    }

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    function getPolicy(address account) external view override returns (PolicyConfig memory) {
        return _policy[account];
    }

    // -------------------------------------------------------------------------
    // Internal
    // -------------------------------------------------------------------------

    function _checkSingle(
        address account,
        uint256 msgValue,
        bytes calldata executionCalldata,
        PolicyConfig storage policy
    ) internal {
        (address target, uint256 callValue, bytes calldata callData) =
            ExecutionDecoder.decodeSingle(executionCalldata);

        // Use the encoded value if present, otherwise the top-level msgValue.
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

        // Block privileged account-management selectors.
        if (PolicyTypes.isPrivilegedSelector(selector)) {
            revert PrivilegedCallBlocked(target, selector);
        }

        // Check (target, selector) whitelist — wildcard fallback handled in WhitelistLib.
        if (!WhitelistLib.isAllowed(_whitelist[account], target, selector)) {
            revert NotWhitelisted(target, selector);
        }

        // Native value cap.
        if (policy.nativeValueCapPerTx > 0 && value > policy.nativeValueCapPerTx) {
            revert NativeValueCapExceeded(value, policy.nativeValueCapPerTx);
        }

        // ERC-20 spend limit — decode amount from transfer/approve/transferFrom calldata.
        if (callData.length >= 4 && ERC20SpendDecoder.isSpendSelector(selector)) {
            uint256 amount = ERC20SpendDecoder.decodeSpendAmount(selector, callData[4:]);
            if (amount > 0) {
                SpendLimitLib.checkAndAccumulate(_spendLimits[account][target], amount);
            }
        }
    }
}

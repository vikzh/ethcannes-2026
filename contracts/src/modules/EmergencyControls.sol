// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { IEmergencyControls } from "../interfaces/IEmergencyControls.sol";
import { IPolicyHook } from "../interfaces/IPolicyHook.sol";
import { IAgentSessionValidator } from "../interfaces/IAgentSessionValidator.sol";
import { IERC7579Account } from "../interfaces/IERC7579Account.sol";
import { ModeCode } from "../types/ExecutionTypes.sol";
import { PolicyTypes } from "../types/PolicyTypes.sol";

/// @notice Executor module that triggers emergency account controls.
contract EmergencyControls is IEmergencyControls {
    function onInstall(bytes calldata) external override {}

    function onUninstall(bytes calldata) external override {}

    function isModuleType(uint256 moduleTypeId) external pure override returns (bool) {
        return moduleTypeId == PolicyTypes.MODULE_TYPE_EXECUTOR;
    }

    function isInitialized(address) external pure override returns (bool) {
        return true;
    }

    function pause(address policyHook) external override {
        if (policyHook == address(0)) revert InvalidModuleAddress(policyHook);
        _executeAsAccount(msg.sender, policyHook, abi.encodeCall(IPolicyHook.pause, ()));
        emit AccountPaused(msg.sender, tx.origin);
    }

    function unpause(address policyHook) external override {
        if (policyHook == address(0)) revert InvalidModuleAddress(policyHook);
        _executeAsAccount(msg.sender, policyHook, abi.encodeCall(IPolicyHook.unpause, ()));
        emit AccountUnpaused(msg.sender, tx.origin);
    }

    function revokeSession(address agentSessionValidator) external override {
        if (agentSessionValidator == address(0)) revert InvalidModuleAddress(agentSessionValidator);
        _executeAsAccount(
            msg.sender,
            agentSessionValidator,
            abi.encodeCall(IAgentSessionValidator.revokeSession, ())
        );
    }

    function emergencyShutdown(address policyHook, address agentSessionValidator) external override {
        if (policyHook == address(0)) revert InvalidModuleAddress(policyHook);
        if (agentSessionValidator == address(0)) revert InvalidModuleAddress(agentSessionValidator);

        _executeAsAccount(msg.sender, policyHook, abi.encodeCall(IPolicyHook.pause, ()));
        _executeAsAccount(
            msg.sender,
            agentSessionValidator,
            abi.encodeCall(IAgentSessionValidator.revokeSession, ())
        );

        emit EmergencyShutdown(msg.sender, tx.origin);
    }

    function isPaused(address account, address policyHook) external view override returns (bool) {
        return IPolicyHook(policyHook).getPolicy(account).paused;
    }

    function _executeAsAccount(address account, address target, bytes memory callData) internal {
        bytes memory executionCalldata = abi.encodePacked(target, uint256(0), callData);
        IERC7579Account(account).executeFromExecutor(ModeCode.wrap(bytes32(0)), executionCalldata);
    }
}

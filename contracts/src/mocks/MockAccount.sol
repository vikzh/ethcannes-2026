// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { IPolicyHook } from "../interfaces/IPolicyHook.sol";
import { IERC7579Module } from "../interfaces/IERC7579Module.sol";

/// @notice Minimal mock ERC-7579 account for testing.
/// Simulates an account that routes its execute calls through PolicyHook.
/// The account address itself is msg.sender to all modules, matching production behaviour.
contract MockAccount {
    address public policyHook;

    // -------------------------------------------------------------------------
    // Module management (simplified — no real module registry)
    // -------------------------------------------------------------------------

    function installModule(address module, bytes calldata initData) external {
        IERC7579Module(module).onInstall(initData);
    }

    function setPolicyHook(address hook) external {
        policyHook = hook;
    }

    // -------------------------------------------------------------------------
    // execute(bytes32 mode, bytes calldata executionCalldata)
    //
    // This function signature is intentional: PolicyHook.preCheck receives msg.data
    // which is the raw calldata of this call, including the 4-byte selector and the
    // ABI-encoded (mode, executionCalldata). PolicyHook decodes it accordingly.
    // -------------------------------------------------------------------------

    function execute(bytes32 mode, bytes calldata executionCalldata) external payable {
        bytes memory hookData = IPolicyHook(policyHook).preCheck(
            msg.sender,
            msg.value,
            msg.data // raw calldata of THIS call — exactly what PolicyHook expects
        );

        _executeSingle(mode, executionCalldata);

        IPolicyHook(policyHook).postCheck(hookData);
    }

    /// @notice Minimal executeFromExecutor used by executor module tests.
    /// @dev In this mock we only support single-call mode and return one entry.
    function executeFromExecutor(bytes32 mode, bytes calldata executionCalldata)
        external
        payable
        returns (bytes[] memory returnData)
    {
        bytes memory ret = _executeSingle(mode, executionCalldata);
        returnData = new bytes[](1);
        returnData[0] = ret;
    }

    function _executeSingle(bytes32 mode, bytes calldata executionCalldata)
        internal
        returns (bytes memory ret)
    {
        // mode[0] == 0x00 → single; 0x01 → batch (batch execution skipped here)
        if (bytes1(mode) != 0x00) return "";

        address target  = address(bytes20(executionCalldata[0:20]));
        uint256 value   = uint256(bytes32(executionCalldata[20:52]));
        bytes memory cd = executionCalldata[52:];
        (bool ok, bytes memory result) = target.call{value: value}(cd);
        if (!ok) {
            assembly {
                revert(add(result, 32), mload(result))
            }
        }
        return result;
    }

    // Allow receiving ETH so tests can fund the account.
    receive() external payable {}
}

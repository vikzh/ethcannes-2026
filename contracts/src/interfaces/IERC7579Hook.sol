// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { IERC7579Module } from "./IERC7579Module.sol";

/// @notice ERC-7579 execution hook interface. Implemented by PolicyHook.
/// Hooks are called by the account before and after every execution.
interface IERC7579Hook is IERC7579Module {
    /// @notice Called before execution. Must revert to block the call.
    /// @dev For executeBatch, msgData encodes all calls; the hook must validate each one.
    /// @param msgSender The address that triggered execution on the account.
    /// @param msgValue  Native token value forwarded with the execution.
    /// @param msgData   Full calldata of the execute / executeBatch call on the account.
    /// @return hookData Opaque data passed verbatim to postCheck.
    function preCheck(
        address msgSender,
        uint256 msgValue,
        bytes calldata msgData
    ) external returns (bytes memory hookData);

    /// @notice Called after execution completes.
    /// @param hookData The value returned by the matching preCheck call.
    function postCheck(bytes calldata hookData) external;
}

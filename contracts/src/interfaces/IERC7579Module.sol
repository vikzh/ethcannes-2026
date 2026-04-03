// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/// @notice Base interface that every ERC-7579 module must implement.
/// Module type IDs: Validator = 1, Executor = 2, Fallback = 3, Hook = 4
interface IERC7579Module {
    /// @notice Called by the smart account when this module is installed.
    /// @param initData ABI-encoded module configuration (owner address, policy config, etc.)
    function onInstall(bytes calldata initData) external;

    /// @notice Called by the smart account when this module is uninstalled.
    /// @param deInitData ABI-encoded teardown data (may be empty)
    function onUninstall(bytes calldata deInitData) external;

    /// @notice Returns true if this module matches the given module type ID.
    function isModuleType(uint256 moduleTypeId) external view returns (bool);

    /// @notice Returns true if this module has been initialized for the given smart account.
    function isInitialized(address smartAccount) external view returns (bool);
}

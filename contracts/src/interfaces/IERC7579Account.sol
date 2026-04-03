// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { ModeCode } from "../types/ExecutionTypes.sol";

/// @notice ERC-7579 account interface.
/// Defines the account-side functions that modules interact with.
/// Our project builds on an existing account implementation (Rhinestone / Safe7579);
/// this interface is provided for type safety in module code and tests.
interface IERC7579Account {
    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event ModuleInstalled(uint256 moduleTypeId, address module);
    event ModuleUninstalled(uint256 moduleTypeId, address module);

    // -------------------------------------------------------------------------
    // Execution
    // -------------------------------------------------------------------------

    /// @notice Executes a call from the account.
    /// @param mode Encoded execution mode (CallType + ExecType + ModeSelector + ModePayload).
    /// @param executionCalldata Encoded execution target(s):
    ///        - Single: abi.encodePacked(target, value, callData)
    ///        - Batch:  abi.encode(Execution[])
    function execute(ModeCode mode, bytes calldata executionCalldata) external payable;

    /// @notice Executes a call from an installed executor module.
    /// @dev msg.sender must be an installed executor module.
    function executeFromExecutor(ModeCode mode, bytes calldata executionCalldata)
        external
        payable
        returns (bytes[] memory returnData);

    // -------------------------------------------------------------------------
    // ERC-1271
    // -------------------------------------------------------------------------

    /// @notice Validates a signature via the installed validator module(s).
    function isValidSignature(bytes32 hash, bytes calldata data) external view returns (bytes4);

    // -------------------------------------------------------------------------
    // Module management
    // -------------------------------------------------------------------------

    /// @notice Installs a module on the account.
    /// @param moduleTypeId Module type (1=Validator, 2=Executor, 3=Fallback, 4=Hook).
    /// @param module       Address of the module contract.
    /// @param initData     ABI-encoded initialization data passed to module.onInstall().
    function installModule(uint256 moduleTypeId, address module, bytes calldata initData) external payable;

    /// @notice Uninstalls a module from the account.
    function uninstallModule(uint256 moduleTypeId, address module, bytes calldata deInitData) external payable;

    // -------------------------------------------------------------------------
    // Config queries
    // -------------------------------------------------------------------------

    /// @notice Returns true if the account supports the given execution mode.
    function supportsExecutionMode(ModeCode encodedMode) external view returns (bool);

    /// @notice Returns true if the account supports the given module type.
    function supportsModule(uint256 moduleTypeId) external view returns (bool);

    /// @notice Returns true if the given module is currently installed.
    function isModuleInstalled(
        uint256 moduleTypeId,
        address module,
        bytes calldata additionalContext
    ) external view returns (bool);

    /// @notice Returns the account implementation identifier.
    function accountId() external view returns (string memory accountImplementationId);
}

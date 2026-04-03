// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { IERC7579Validator } from "./IERC7579Validator.sol";

/// @notice Owner validator interface.
/// The owner is the root authority of the smart account. This validator authenticates
/// ECDSA signatures from the owner EOA and authorises all admin-level operations.
///
/// Module type: Validator (1)
/// Storage pattern: mapping(address account => address owner)
interface IOwnerValidator is IERC7579Validator {
    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event OwnerChanged(address indexed account, address indexed oldOwner, address indexed newOwner);

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error NotOwner(address caller, address expected);
    error ZeroAddress();
    error AlreadyInitialized(address account);

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    /// @notice Returns the owner address registered for the given account.
    function getOwner(address account) external view returns (address owner);

    // -------------------------------------------------------------------------
    // Owner management
    // -------------------------------------------------------------------------

    /// @notice Replaces the owner address for the calling account.
    /// @dev Must be called through the account's execute path (msg.sender == account).
    ///      Emits OwnerChanged.
    /// @param newOwner The new owner address. Must not be zero.
    function transferOwnership(address newOwner) external;
}

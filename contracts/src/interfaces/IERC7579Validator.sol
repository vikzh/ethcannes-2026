// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { IERC7579Module } from "./IERC7579Module.sol";
import { PackedUserOperation } from "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";

/// @notice ERC-7579 validator interface. Implemented by OwnerValidator and AgentSessionValidator.
interface IERC7579Validator is IERC7579Module {
    /// @notice Validates a UserOperation from the ERC-4337 EntryPoint.
    /// @dev Must return a packed validationData value:
    ///      - bits[0]:     0 = success, 1 = failure
    ///      - bits[160..207]: validAfter (uint48 timestamp)
    ///      - bits[208..255]: validUntil (uint48 timestamp, 0 = no expiry)
    /// @param userOp    The packed UserOperation submitted to the EntryPoint.
    /// @param userOpHash keccak256 hash of the UserOperation fields (excluding signature).
    /// @return validationData Packed result as described above.
    function validateUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash
    ) external returns (uint256 validationData);

    /// @notice ERC-1271-style signature validation routed through the account.
    /// @param sender    The address that triggered the isValidSignature call on the account.
    /// @param hash      The message hash to verify.
    /// @param signature The signature bytes to validate.
    /// @return magicValue bytes4(keccak256("isValidSignature(bytes32,bytes)")) on success,
    ///                    or 0xffffffff on failure.
    function isValidSignatureWithSender(
        address sender,
        bytes32 hash,
        bytes calldata signature
    ) external view returns (bytes4 magicValue);
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/// @notice Shared constants and pure helpers for policy enforcement.
library PolicyTypes {
    // -------------------------------------------------------------------------
    // Module type IDs (ERC-7579)
    // -------------------------------------------------------------------------

    uint256 internal constant MODULE_TYPE_VALIDATOR = 1;
    uint256 internal constant MODULE_TYPE_EXECUTOR   = 2;
    uint256 internal constant MODULE_TYPE_FALLBACK   = 3;
    uint256 internal constant MODULE_TYPE_HOOK       = 4;

    // -------------------------------------------------------------------------
    // Validation data constants (ERC-4337)
    // -------------------------------------------------------------------------

    uint256 internal constant SIG_VALIDATION_SUCCESS = 0;
    uint256 internal constant SIG_VALIDATION_FAILED  = 1;

    // -------------------------------------------------------------------------
    // Whitelist
    // -------------------------------------------------------------------------

    /// @dev When stored as the selector in a whitelist entry, permits any function
    ///      on the associated target address.
    bytes4 internal constant WILDCARD_SELECTOR = bytes4(0xffffffff);

    /// @notice Computes the storage key for a (target, selector) whitelist entry.
    function whitelistKey(address target, bytes4 selector) internal pure returns (bytes32) {
        return keccak256(abi.encode(target, selector));
    }

    // -------------------------------------------------------------------------
    // Privileged selector blocklist
    // -------------------------------------------------------------------------
    // These selectors map to account management functions that must never be
    // callable by the agent, regardless of whitelist configuration.

    bytes4 internal constant SEL_INSTALL_MODULE    = bytes4(keccak256("installModule(uint256,address,bytes)"));
    bytes4 internal constant SEL_UNINSTALL_MODULE  = bytes4(keccak256("uninstallModule(uint256,address,bytes)"));
    bytes4 internal constant SEL_TRANSFER_OWNERSHIP = bytes4(keccak256("transferOwnership(address)"));
    bytes4 internal constant SEL_SET_FALLBACK       = bytes4(keccak256("setFallbackHandler(address)"));

    /// @notice Returns true if the selector is in the privileged blocklist.
    /// @dev Called in PolicyHook.preCheck to guard against agent self-escalation.
    function isPrivilegedSelector(bytes4 selector) internal pure returns (bool) {
        return selector == SEL_INSTALL_MODULE
            || selector == SEL_UNINSTALL_MODULE
            || selector == SEL_TRANSFER_OWNERSHIP
            || selector == SEL_SET_FALLBACK;
    }

    // -------------------------------------------------------------------------
    // Validation data packing (ERC-4337)
    // -------------------------------------------------------------------------

    /// @notice Packs validAfter/validUntil timestamps and a failure flag into the
    ///         uint256 validationData format expected by the EntryPoint.
    /// @param failed      True if signature validation failed.
    /// @param validAfter  Timestamp after which the UserOp becomes valid.
    /// @param validUntil  Timestamp after which the UserOp expires. 0 = no expiry.
    function packValidationData(
        bool   failed,
        uint48 validAfter,
        uint48 validUntil
    ) internal pure returns (uint256) {
        return (failed ? 1 : 0)
            | (uint256(validAfter)  << 160)
            | (uint256(validUntil)  << 208);
    }
}

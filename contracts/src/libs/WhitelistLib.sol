// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { PolicyTypes } from "../types/PolicyTypes.sol";

/// @notice Library for (address, bytes4) tuple whitelist operations.
/// Uses keccak256(abi.encode(target, selector)) as the mapping key to avoid
/// slot collisions between different (target, selector) combinations.
library WhitelistLib {
    /// @notice Activates a (target, selector) entry in the whitelist.
    function add(
        mapping(bytes32 => bool) storage wl,
        address target,
        bytes4  selector
    ) internal {
        wl[PolicyTypes.whitelistKey(target, selector)] = true;
    }

    /// @notice Deactivates a (target, selector) entry in the whitelist.
    function remove(
        mapping(bytes32 => bool) storage wl,
        address target,
        bytes4  selector
    ) internal {
        wl[PolicyTypes.whitelistKey(target, selector)] = false;
    }

    /// @notice Returns true if the (target, selector) entry is active.
    /// @dev Does NOT check the wildcard — callers should call isAllowed for full semantics.
    function isActive(
        mapping(bytes32 => bool) storage wl,
        address target,
        bytes4  selector
    ) internal view returns (bool) {
        return wl[PolicyTypes.whitelistKey(target, selector)];
    }

    /// @notice Returns true if the call is permitted by the whitelist.
    /// @dev Checks the exact (target, selector) entry first, then falls back to
    ///      the wildcard selector (WILDCARD_SELECTOR) for the same target.
    function isAllowed(
        mapping(bytes32 => bool) storage wl,
        address target,
        bytes4  selector
    ) internal view returns (bool) {
        return wl[PolicyTypes.whitelistKey(target, selector)]
            || wl[PolicyTypes.whitelistKey(target, PolicyTypes.WILDCARD_SELECTOR)];
    }
}

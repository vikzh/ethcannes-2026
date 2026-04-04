// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { IENSRegistry, IENSResolver } from "../interfaces/IENS.sol";

/// @notice Library for ENS name resolution and verification.
/// @dev Uses a two-step resolution: registry → resolver address → target address.
///      Gracefully returns address(0) when the registry is absent or the node
///      has no resolver, so callers can distinguish "unresolvable" from "mismatch".
library ENSVerifier {
    /// @notice Resolves an ENS node to an address using the given registry.
    /// @param registry ENS registry address. If address(0), returns address(0).
    /// @param node     ENS namehash to resolve.
    /// @return resolved The address the ENS name points to, or address(0) if unresolvable.
    function resolve(address registry, bytes32 node) internal view returns (address resolved) {
        if (registry == address(0) || node == bytes32(0)) return address(0);

        address resolverAddr = IENSRegistry(registry).resolver(node);
        if (resolverAddr == address(0)) return address(0);

        resolved = IENSResolver(resolverAddr).addr(node);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/// @notice Minimal ENS registry interface for on-chain name resolution.
interface IENSRegistry {
    /// @notice Returns the resolver address for the given ENS node.
    function resolver(bytes32 node) external view returns (address);

    /// @notice Returns the owner of the given ENS node.
    function owner(bytes32 node) external view returns (address);
}

/// @notice Minimal ENS public resolver interface.
interface IENSResolver {
    /// @notice Returns the address associated with the given ENS node.
    function addr(bytes32 node) external view returns (address);
}

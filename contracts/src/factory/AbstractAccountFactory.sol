// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { IsolatedAccount } from "../accounts/IsolatedAccount.sol";

/// @notice Minimal factory for deploying isolated modular accounts.
/// @dev Uses CREATE2 for deterministic addresses and supports optional
///      policy hook setup plus module installation at deploy time.
contract AbstractAccountFactory {
    struct ModuleInit {
        address module;
        bytes initData;
    }

    event AccountDeployed(
        address indexed account,
        address indexed owner,
        address deployer,
        bytes32 salt,
        address policyHook
    );

    error ZeroModuleAddress();
    error DeploymentFailed();

    /// @notice Deploys a new account with CREATE2 and optional module setup.
    /// @param salt CREATE2 salt.
    /// @param policyHook Optional policy hook address; zero address skips setup.
    /// @param modules List of modules to install on the new account.
    function deployAccount(
        bytes32 salt,
        address policyHook,
        ModuleInit[] calldata modules
    ) external returns (address account) {
        bytes memory bytecode =
            abi.encodePacked(type(IsolatedAccount).creationCode, abi.encode(address(this), policyHook));
        address deployedAddress;
        assembly {
            deployedAddress := create2(0, add(bytecode, 0x20), mload(bytecode), salt)
        }
        if (deployedAddress == address(0)) revert DeploymentFailed();
        IsolatedAccount deployed = IsolatedAccount(payable(deployedAddress));

        for (uint256 i; i < modules.length; ++i) {
            if (modules[i].module == address(0)) revert ZeroModuleAddress();
            deployed.installModule(modules[i].module, modules[i].initData);
        }
        deployed.transferOwnership(msg.sender);

        account = address(deployed);
        emit AccountDeployed(account, msg.sender, msg.sender, salt, policyHook);
    }

    /// @notice Computes deterministic account address for given salt and policy hook.
    function predictAccountAddress(bytes32 salt, address policyHook) external view returns (address predicted) {
        bytes32 codeHash = keccak256(
            abi.encodePacked(type(IsolatedAccount).creationCode, abi.encode(address(this), policyHook))
        );
        bytes32 hash = keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, codeHash));
        predicted = address(uint160(uint256(hash)));
    }
}

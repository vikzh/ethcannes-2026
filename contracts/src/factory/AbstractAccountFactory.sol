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
    event AgentWalletBound(address indexed agent, address indexed account);
    event UserWalletBound(address indexed user, address indexed account);
    event AgentFunded(address indexed agent, uint256 amount);

    error ZeroModuleAddress();
    error ZeroAgentAddress();
    error DeploymentFailed();
    error AgentFundingTransferFailed(address agent, uint256 amount);
    error AgentAlreadyHasWallet(address agent, address existingAccount);

    mapping(address agent => address account) private _walletByAgent;
    mapping(address user => address[]) private _walletsByUser;

    /// @notice Deploys a new account with CREATE2 and optional module setup.
    /// @param salt CREATE2 salt.
    /// @param policyHook Optional policy hook address; zero address skips setup.
    /// @param modules List of modules to install on the new account.
    function deployAccount(
        bytes32 salt,
        address policyHook,
        ModuleInit[] calldata modules,
        address agent
    ) external payable returns (address account) {
        if (agent == address(0)) revert ZeroAgentAddress();
        address user = msg.sender;

        address existing = _walletByAgent[agent];
        if (existing != address(0)) revert AgentAlreadyHasWallet(agent, existing);

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
        _walletByAgent[agent] = account;
        _walletsByUser[user].push(account);

        if (msg.value > 0) {
            (bool sent, ) = agent.call{ value: msg.value }("");
            if (!sent) revert AgentFundingTransferFailed(agent, msg.value);
            emit AgentFunded(agent, msg.value);
        }

        emit AccountDeployed(account, msg.sender, msg.sender, salt, policyHook);
        emit AgentWalletBound(agent, account);
        emit UserWalletBound(user, account);
    }

    function getWalletByAgent(address agent) external view returns (address account) {
        return _walletByAgent[agent];
    }

    function getWalletByUser(address user) external view returns (address account) {
        uint256 len = _walletsByUser[user].length;
        if (len == 0) return address(0);
        return _walletsByUser[user][len - 1];
    }

    function getWalletsByUser(address user) external view returns (address[] memory accounts) {
        return _walletsByUser[user];
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

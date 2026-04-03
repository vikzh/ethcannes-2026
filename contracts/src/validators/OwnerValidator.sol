// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { IOwnerValidator } from "../interfaces/IOwnerValidator.sol";
import { PackedUserOperation } from "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { MessageHashUtils } from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import { PolicyTypes } from "../types/PolicyTypes.sol";

/// @notice Owner validator module.
/// Authenticates ECDSA signatures from the human owner of the smart account.
/// Installed as a Validator (type 1) module.
///
/// Storage: mapping(account => owner address)
/// The account calls onInstall(abi.encode(ownerAddress)) during setup.
contract OwnerValidator is IOwnerValidator {
    using ECDSA for bytes32;

    bytes4 private constant ERC1271_SUCCESS = 0x1626ba7e;
    bytes4 private constant ERC1271_FAILED  = 0xffffffff;

    mapping(address account => address owner) private _owners;

    // -------------------------------------------------------------------------
    // IERC7579Module
    // -------------------------------------------------------------------------

    function onInstall(bytes calldata initData) external override {
        address account = msg.sender;
        if (_owners[account] != address(0)) revert AlreadyInitialized(account);
        address owner = abi.decode(initData, (address));
        if (owner == address(0)) revert ZeroAddress();
        _owners[account] = owner;
    }

    function onUninstall(bytes calldata) external override {
        delete _owners[msg.sender];
    }

    function isModuleType(uint256 moduleTypeId) external pure override returns (bool) {
        return moduleTypeId == PolicyTypes.MODULE_TYPE_VALIDATOR;
    }

    function isInitialized(address smartAccount) external view override returns (bool) {
        return _owners[smartAccount] != address(0);
    }

    // -------------------------------------------------------------------------
    // IERC7579Validator
    // -------------------------------------------------------------------------

    function validateUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash
    ) external view override returns (uint256) {
        address owner = _owners[userOp.sender];
        if (owner == address(0)) return PolicyTypes.SIG_VALIDATION_FAILED;

        bytes32 ethHash = MessageHashUtils.toEthSignedMessageHash(userOpHash);
        address recovered = ECDSA.recover(ethHash, userOp.signature);

        return recovered == owner
            ? PolicyTypes.SIG_VALIDATION_SUCCESS
            : PolicyTypes.SIG_VALIDATION_FAILED;
    }

    function isValidSignatureWithSender(
        address, /* sender */
        bytes32 hash,
        bytes calldata signature
    ) external view override returns (bytes4) {
        address owner = _owners[msg.sender];
        if (owner == address(0)) return ERC1271_FAILED;

        bytes32 ethHash = MessageHashUtils.toEthSignedMessageHash(hash);
        address recovered = ECDSA.recover(ethHash, signature);

        return recovered == owner ? ERC1271_SUCCESS : ERC1271_FAILED;
    }

    // -------------------------------------------------------------------------
    // IOwnerValidator
    // -------------------------------------------------------------------------

    function getOwner(address account) external view override returns (address) {
        return _owners[account];
    }

    function transferOwnership(address newOwner) external override {
        if (newOwner == address(0)) revert ZeroAddress();
        address account = msg.sender;
        address old = _owners[account];
        _owners[account] = newOwner;
        emit OwnerChanged(account, old, newOwner);
    }
}

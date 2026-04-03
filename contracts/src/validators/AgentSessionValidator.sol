// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { IAgentSessionValidator } from "../interfaces/IAgentSessionValidator.sol";
import { PackedUserOperation } from "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { MessageHashUtils } from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import { PolicyTypes } from "../types/PolicyTypes.sol";

/// @notice Agent session validator module.
/// Authenticates a delegated agent EOA key within a bounded session window.
/// Installed as a Validator (type 1) module.
///
/// Storage: mapping(account => Session)
/// One active session per account at a time. Creating a new session overwrites the previous one.
contract AgentSessionValidator is IAgentSessionValidator {
    using ECDSA for bytes32;

    bytes4 private constant ERC1271_FAILED = 0xffffffff;

    mapping(address account => Session) private _sessions;

    // -------------------------------------------------------------------------
    // IERC7579Module
    // -------------------------------------------------------------------------

    /// @param initData abi.encode(address agentKey, uint48 validAfter, uint48 validUntil)
    function onInstall(bytes calldata initData) external override {
        address account = msg.sender;
        if (_sessions[account].agentKey != address(0)) revert AlreadyInitialized(account);
        (address agentKey, uint48 validAfter, uint48 validUntil) =
            abi.decode(initData, (address, uint48, uint48));
        _createSession(account, agentKey, validAfter, validUntil);
    }

    function onUninstall(bytes calldata) external override {
        delete _sessions[msg.sender];
    }

    function isModuleType(uint256 moduleTypeId) external pure override returns (bool) {
        return moduleTypeId == PolicyTypes.MODULE_TYPE_VALIDATOR;
    }

    function isInitialized(address smartAccount) external view override returns (bool) {
        return _sessions[smartAccount].agentKey != address(0);
    }

    // -------------------------------------------------------------------------
    // IERC7579Validator
    // -------------------------------------------------------------------------

    function validateUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash
    ) external view override returns (uint256) {
        Session storage session = _sessions[userOp.sender];

        if (session.agentKey == address(0)) return PolicyTypes.SIG_VALIDATION_FAILED;
        if (session.revoked)               return PolicyTypes.SIG_VALIDATION_FAILED;

        bytes32 ethHash = MessageHashUtils.toEthSignedMessageHash(userOpHash);
        address recovered = ECDSA.recover(ethHash, userOp.signature);

        if (recovered != session.agentKey) return PolicyTypes.SIG_VALIDATION_FAILED;

        // Pack validAfter/validUntil into the return value so the EntryPoint can enforce timing.
        return PolicyTypes.packValidationData(false, session.validAfter, session.validUntil);
    }

    /// @dev Agent sessions do not support ERC-1271 — only the owner validator does.
    function isValidSignatureWithSender(
        address,
        bytes32,
        bytes calldata
    ) external pure override returns (bytes4) {
        return ERC1271_FAILED;
    }

    // -------------------------------------------------------------------------
    // IAgentSessionValidator
    // -------------------------------------------------------------------------

    function createSession(
        address agentKey,
        uint48 validAfter,
        uint48 validUntil
    ) external override {
        _createSession(msg.sender, agentKey, validAfter, validUntil);
    }

    function revokeSession() external override {
        Session storage session = _sessions[msg.sender];
        uint256 nonce = session.nonce;
        session.revoked = true;
        emit SessionRevoked(msg.sender, nonce);
    }

    function getSession(address account) external view override returns (Session memory) {
        return _sessions[account];
    }

    function hasActiveSession(address account) external view override returns (bool) {
        Session storage session = _sessions[account];
        if (session.agentKey == address(0))                    return false;
        if (session.revoked)                                   return false;
        if (block.timestamp < uint256(session.validAfter))     return false;
        if (session.validUntil != 0 && block.timestamp >= uint256(session.validUntil)) return false;
        return true;
    }

    // -------------------------------------------------------------------------
    // Internal
    // -------------------------------------------------------------------------

    function _createSession(
        address account,
        address agentKey,
        uint48 validAfter,
        uint48 validUntil
    ) internal {
        uint256 newNonce = _sessions[account].nonce + 1;
        _sessions[account] = Session({
            agentKey:   agentKey,
            validAfter: validAfter,
            validUntil: validUntil,
            nonce:      newNonce,
            revoked:    false
        });
        emit SessionCreated(account, newNonce, agentKey, validAfter, validUntil);
    }
}

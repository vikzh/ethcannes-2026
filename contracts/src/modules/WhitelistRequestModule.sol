// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { IWhitelistRequestModule } from "../interfaces/IWhitelistRequestModule.sol";
import { IPolicyHook } from "../interfaces/IPolicyHook.sol";
import { IERC7579Account } from "../interfaces/IERC7579Account.sol";
import { PolicyTypes } from "../types/PolicyTypes.sol";
import { ModeCode } from "../types/ExecutionTypes.sol";

/// @notice Whitelist request module.
/// Manages the two-step propose/approve lifecycle for adding (target, selector) entries
/// to PolicyHook's active whitelist.
///
/// Flow:
///   Agent calls requestWhitelistAddition() → request stored as Pending
///   Owner calls approveRequest(requestId, policyHook) → activates entry in PolicyHook
///
/// approveRequest is called through the account's execute path (msg.sender == account),
/// then calls policyHook.addWhitelistEntry() where policyHook also sees msg.sender == account.
/// This keeps the PolicyHook's "caller must be account" invariant intact.
///
/// Module type: Executor (2)
/// Storage: per-account request queues keyed by msg.sender
contract WhitelistRequestModule is IWhitelistRequestModule {
    mapping(address account => WhitelistRequest[]) private _requests;

    // -------------------------------------------------------------------------
    // IERC7579Module
    // -------------------------------------------------------------------------

    function onInstall(bytes calldata) external override {
        // Nothing to initialize — request array starts empty.
    }

    function onUninstall(bytes calldata) external override {
        delete _requests[msg.sender];
    }

    function isModuleType(uint256 moduleTypeId) external pure override returns (bool) {
        return moduleTypeId == PolicyTypes.MODULE_TYPE_EXECUTOR;
    }

    function isInitialized(address) external pure override returns (bool) {
        return true; // Stateless init — always considered initialized.
    }

    // -------------------------------------------------------------------------
    // Agent-callable (msg.sender == account, acting on behalf of the agent)
    // -------------------------------------------------------------------------

    function requestWhitelistAddition(
        address target,
        bytes4  selector,
        string  calldata metadata
    ) external override returns (uint256 requestId) {
        if (target == address(0)) revert ZeroTarget();

        address account = msg.sender;

        // Reject duplicate pending requests for the same (target, selector).
        WhitelistRequest[] storage reqs = _requests[account];
        for (uint256 i; i < reqs.length; ++i) {
            if (
                reqs[i].target   == target   &&
                reqs[i].selector == selector &&
                reqs[i].status   == RequestStatus.Pending
            ) {
                revert DuplicatePendingRequest(target, selector);
            }
        }

        requestId = reqs.length;
        reqs.push(WhitelistRequest({
            requestId: requestId,
            target:    target,
            selector:  selector,
            metadata:  metadata,
            status:    RequestStatus.Pending,
            createdAt: block.timestamp
        }));

        emit WhitelistRequested(account, requestId, target, selector, metadata);
    }

    function cancelRequest(uint256 requestId) external override {
        WhitelistRequest storage req = _getRequest(msg.sender, requestId);
        if (req.status != RequestStatus.Pending) revert RequestNotPending(requestId, req.status);
        req.status = RequestStatus.Cancelled;
        emit WhitelistRequestCancelled(msg.sender, requestId);
    }

    // -------------------------------------------------------------------------
    // Owner-callable (msg.sender == account, triggered via owner-signed UserOp)
    // -------------------------------------------------------------------------

    /// @notice Approves a pending request and activates the entry directly in PolicyHook.
    /// @dev Both this module and PolicyHook are called with msg.sender == account (the smart
    ///      account address), so PolicyHook's caller check is satisfied without executeFromExecutor.
    ///      The caller (account) must pass the correct policyHook address.
    function approveRequest(uint256 requestId, address policyHook) external override {
        if (policyHook == address(0)) revert InvalidPolicyHook(policyHook);

        address account = msg.sender;
        WhitelistRequest storage req = _getRequest(account, requestId);
        if (req.status != RequestStatus.Pending) revert RequestNotPending(requestId, req.status);

        req.status = RequestStatus.Approved;
        emit WhitelistApproved(account, requestId, req.target, req.selector);

        // Route through account.executeFromExecutor so PolicyHook sees msg.sender == account.
        bytes memory callData = abi.encodeCall(IPolicyHook.addWhitelistEntry, (req.target, req.selector));
        bytes memory executionCalldata = abi.encodePacked(policyHook, uint256(0), callData);
        IERC7579Account(account).executeFromExecutor(ModeCode.wrap(bytes32(0)), executionCalldata);
    }

    function rejectRequest(uint256 requestId) external override {
        WhitelistRequest storage req = _getRequest(msg.sender, requestId);
        if (req.status != RequestStatus.Pending) revert RequestNotPending(requestId, req.status);
        req.status = RequestStatus.Rejected;
        emit WhitelistRejected(msg.sender, requestId);
    }

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    function getRequest(
        address account,
        uint256 requestId
    ) external view override returns (WhitelistRequest memory) {
        return _getRequest(account, requestId);
    }

    function getPendingRequests(
        address account
    ) external view override returns (WhitelistRequest[] memory) {
        WhitelistRequest[] storage all = _requests[account];
        uint256 count;
        for (uint256 i; i < all.length; ++i) {
            if (all[i].status == RequestStatus.Pending) ++count;
        }
        WhitelistRequest[] memory pending = new WhitelistRequest[](count);
        uint256 j;
        for (uint256 i; i < all.length; ++i) {
            if (all[i].status == RequestStatus.Pending) pending[j++] = all[i];
        }
        return pending;
    }

    function getNextRequestId(address account) external view override returns (uint256) {
        return _requests[account].length;
    }

    // -------------------------------------------------------------------------
    // Internal
    // -------------------------------------------------------------------------

    function _getRequest(
        address account,
        uint256 requestId
    ) internal view returns (WhitelistRequest storage) {
        WhitelistRequest[] storage reqs = _requests[account];
        if (requestId >= reqs.length) revert RequestNotFound(account, requestId);
        return reqs[requestId];
    }
}

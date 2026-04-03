// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { IERC7579Module } from "./IERC7579Module.sol";

/// @notice Whitelist request module interface.
/// Manages the two-step proposal/approval lifecycle for adding new (target, selector)
/// entries to the PolicyHook whitelist.
///
/// Flow:
///   1. Agent calls requestWhitelistAddition(target, selector, metadata)
///   2. Human reviews the pending request offchain (event-driven)
///   3. Owner calls approveRequest(requestId, policyHook) or rejectRequest(requestId)
///   4. On approval, the entry is activated in PolicyHook
///
/// The agent can cancel its own pending requests before owner action.
/// Duplicate pending requests for the same (target, selector) are rejected.
///
/// Module type: Executor (2)
/// Storage pattern: mapping(address account => RequestState)
interface IWhitelistRequestModule is IERC7579Module {
    // -------------------------------------------------------------------------
    // Types
    // -------------------------------------------------------------------------

    enum RequestStatus {
        Pending,
        Approved,
        Rejected,
        Cancelled
    }

    struct WhitelistRequest {
        uint256       requestId;
        address       target;
        bytes4        selector;
        /// @dev Free-form justification from the agent (protocol name, reason, URL).
        string        metadata;
        RequestStatus status;
        uint256       createdAt;
    }

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event WhitelistRequested(
        address indexed account,
        uint256 indexed requestId,
        address indexed target,
        bytes4  selector,
        string  metadata
    );

    event WhitelistApproved(
        address indexed account,
        uint256 indexed requestId,
        address indexed target,
        bytes4  selector
    );

    event WhitelistRejected(address indexed account, uint256 indexed requestId);

    event WhitelistRequestCancelled(address indexed account, uint256 indexed requestId);

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error RequestNotFound(address account, uint256 requestId);
    error RequestNotPending(uint256 requestId, RequestStatus currentStatus);
    error DuplicatePendingRequest(address target, bytes4 selector);
    error ZeroTarget();
    error CallerNotAgent(address caller);
    error CallerNotOwner(address caller);
    error InvalidPolicyHook(address policyHook);

    // -------------------------------------------------------------------------
    // Agent-callable
    // -------------------------------------------------------------------------

    /// @notice Submits a request to add a (target, selector) tuple to the whitelist.
    /// @dev Reverts with DuplicatePendingRequest if an identical pending request exists.
    ///      The agent must be calling through the account's execute path.
    /// @param target   Destination address the agent wants to interact with.
    /// @param selector Function selector the agent wants to call. Use 0xffffffff for wildcard.
    /// @param metadata Free-form justification (e.g. protocol name, reason).
    /// @return requestId Monotonically increasing ID for this request.
    function requestWhitelistAddition(
        address target,
        bytes4  selector,
        string  calldata metadata
    ) external returns (uint256 requestId);

    /// @notice Cancels a pending request submitted by the caller.
    /// @dev Reverts if requestId is not found, not pending, or not owned by caller.
    function cancelRequest(uint256 requestId) external;

    // -------------------------------------------------------------------------
    // Owner-callable (through account execute path)
    // -------------------------------------------------------------------------

    /// @notice Approves a pending request and activates the entry in PolicyHook.
    /// @dev Calls policyHook.addWhitelistEntry(target, selector) through the account.
    ///      policyHook must be the address of the PolicyHook module installed on this account.
    /// @param requestId  The request to approve.
    /// @param policyHook Address of the PolicyHook module for this account.
    function approveRequest(uint256 requestId, address policyHook) external;

    /// @notice Rejects a pending request. No whitelist change occurs.
    function rejectRequest(uint256 requestId) external;

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    /// @notice Returns a single request for the given account.
    function getRequest(address account, uint256 requestId) external view returns (WhitelistRequest memory);

    /// @notice Returns all pending requests for the given account.
    function getPendingRequests(address account) external view returns (WhitelistRequest[] memory);

    /// @notice Returns the next requestId that will be assigned for the given account.
    function getNextRequestId(address account) external view returns (uint256);
}

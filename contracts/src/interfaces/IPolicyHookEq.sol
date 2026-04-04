// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { IPolicyHook } from "./IPolicyHook.sol";

/// @notice Policy hook interface with optional equality predicates on ABI words.
/// @dev V1 predicates compare a single 32-byte ABI word at paramIndex against an
///      expected value. This works naturally for static arguments such as
///      address, uint256, bytes32, and bool. Dynamic ABI types compare their
///      head word (typically an offset), not the decoded payload.
interface IPolicyHookEq is IPolicyHook {
    /// @param paramIndex    Zero-based ABI parameter index after the selector.
    /// @param expectedValue ABI-encoded 32-byte word that must match exactly.
    struct EqCondition {
        uint8 paramIndex;
        bytes32 expectedValue;
    }

    /// @param target         Destination contract address.
    /// @param selector       Exact function selector this rule applies to.
    /// @param active         Whether this rule is currently active.
    /// @param conditionCount Number of equality predicates attached to the rule.
    struct EqRule {
        address target;
        bytes4 selector;
        bool active;
        uint256 conditionCount;
    }

    event EqRuleAdded(address indexed account, bytes32 indexed ruleId, address indexed target, bytes4 selector);
    event EqRuleRemoved(address indexed account, bytes32 indexed ruleId);

    error EqRuleAlreadyExists(bytes32 ruleId);
    error EqRuleNotFound(bytes32 ruleId);
    error EqRuleNotSatisfied(address target, bytes4 selector);
    error EqConditionsUnsorted();
    error WildcardEqRuleUnsupported();

    /// @notice Adds an equality-constrained rule for an exact (target, selector).
    /// @dev Conditions must be sorted by paramIndex in strictly increasing order.
    ///      An empty conditions array creates an unrestricted exact-selector rule.
    ///      msg.sender must be the account (same model as IPolicyHook config calls).
    function addEqRule(address target, bytes4 selector, EqCondition[] calldata conditions)
        external
        returns (bytes32 ruleId);

    /// @notice Removes a previously added equality rule.
    function removeEqRule(bytes32 ruleId) external;

    /// @notice Returns the rule header plus its conditions.
    function getEqRule(address account, bytes32 ruleId)
        external
        view
        returns (EqRule memory rule, EqCondition[] memory conditions);

    /// @notice Returns true if there is at least one active equality rule for the tuple.
    function hasEqRules(address account, address target, bytes4 selector) external view returns (bool);

    /// @notice Deterministically computes the rule id for a rule definition.
    function computeEqRuleId(address target, bytes4 selector, EqCondition[] calldata conditions)
        external
        pure
        returns (bytes32 ruleId);
}

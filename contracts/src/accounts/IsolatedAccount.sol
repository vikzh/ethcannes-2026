// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { IERC7579Module } from "../interfaces/IERC7579Module.sol";
import { IPolicyHook } from "../interfaces/IPolicyHook.sol";
import { IAgentSessionValidator } from "../interfaces/IAgentSessionValidator.sol";
import { IWhitelistRequestModule } from "../interfaces/IWhitelistRequestModule.sol";
import { Execution } from "../types/ExecutionTypes.sol";

/// @notice Isolated (non-4337) modular account with signed execution.
/// @dev Auth is enforced via owner EIP-712 signatures and nonce replay protection.
contract IsolatedAccount is EIP712 {
    bytes32 private constant EXECUTE_TYPEHASH = keccak256(
        "ExecuteRequest(bytes32 mode,bytes32 executionCalldataHash,uint256 nonce,uint256 deadline)"
    );

    address public owner;
    address public policyHook;
    address public agentSessionValidator;
    address public whitelistModule;
    uint256 public nonce;

    mapping(address => bool) public isModuleInstalled;
    mapping(address => bool) public isExecutorModule;

    error Unauthorized(address caller);
    error UnauthorizedExecutor(address module);
    error ZeroAddress();
    error InvalidNonce(uint256 expected, uint256 got);
    error SignatureExpired(uint256 deadline);
    error InvalidSignature();
    error AgentSessionInvalid(address signer);
    error WhitelistModuleNotConfigured();
    error UnsupportedMode(bytes1 callType);
    error InvalidExecutionCalldata();
    error PolicyPreCheckFailed(bytes revertData);
    error PolicyPostCheckFailed(bytes revertData);
    error ModuleAlreadyInstalled(address module);
    error ModuleNotInstalled(address module);

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event PolicyHookSet(address indexed policyHook);
    event AgentSessionValidatorSet(address indexed validator);
    event WhitelistModuleSet(address indexed module);
    event ModuleInstalled(address indexed module, bool isExecutor);
    event ModuleUninstalled(address indexed module);
    event ExecutionEnvelope(
        address indexed account,
        address indexed signer,
        address indexed caller,
        uint256 nonce,
        bytes32 mode,
        uint256 deadline,
        bytes32 executionHash,
        uint256 callCount,
        bool policyChecked
    );
    event Executed(
        address indexed target,
        uint256 value,
        bytes4 selector,
        uint256 indexed nonce,
        bytes32 indexed executionHash,
        uint256 callIndex
    );

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized(msg.sender);
        _;
    }

    modifier onlyExecutorModule() {
        if (!isExecutorModule[msg.sender]) revert UnauthorizedExecutor(msg.sender);
        _;
    }

    constructor(address owner_, address policyHook_, address whitelistModule_) EIP712("IsolatedAccount", "1") {
        if (owner_ == address(0)) revert ZeroAddress();
        owner = owner_;
        policyHook = policyHook_;
        whitelistModule = whitelistModule_;
        emit OwnershipTransferred(address(0), owner_);
        emit PolicyHookSet(policyHook_);
        emit WhitelistModuleSet(whitelistModule_);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }

    function setPolicyHook(address hook) external onlyOwner {
        policyHook = hook;
        emit PolicyHookSet(hook);
    }

    function setAgentSessionValidator(address validator) external onlyOwner {
        agentSessionValidator = validator;
        emit AgentSessionValidatorSet(validator);
    }

    function setWhitelistModule(address module) external onlyOwner {
        whitelistModule = module;
        emit WhitelistModuleSet(module);
    }

    function installModule(address module, bytes calldata initData) external onlyOwner {
        if (module == address(0)) revert ZeroAddress();
        if (isModuleInstalled[module]) revert ModuleAlreadyInstalled(module);

        IERC7579Module(module).onInstall(initData);
        bool executor = IERC7579Module(module).isModuleType(2);

        isModuleInstalled[module] = true;
        if (executor) isExecutorModule[module] = true;
        emit ModuleInstalled(module, executor);
    }

    function uninstallModule(address module, bytes calldata deInitData) external onlyOwner {
        if (!isModuleInstalled[module]) revert ModuleNotInstalled(module);
        IERC7579Module(module).onUninstall(deInitData);
        delete isModuleInstalled[module];
        delete isExecutorModule[module];
        emit ModuleUninstalled(module);
    }

    function execute(bytes32 mode, bytes calldata executionCalldata) external payable onlyOwner {
        bytes32 executionHash = keccak256(executionCalldata);
        emit ExecutionEnvelope(
            address(this),
            owner,
            msg.sender,
            type(uint256).max,
            mode,
            0,
            executionHash,
            _callCount(mode, executionCalldata),
            false
        );
        _execute(mode, executionCalldata, type(uint256).max, executionHash);
    }

    /// @notice Agent-only proxy entrypoint for direct account execution.
    /// @dev Requires an active session in `agentSessionValidator` and still runs policy pre/post checks.
    function executeAsAgent(bytes32 mode, bytes calldata executionCalldata)
        external
        payable
        returns (bytes[] memory results)
    {
        if (!_isActiveAgentSigner(msg.sender)) revert AgentSessionInvalid(msg.sender);

        bytes32 executionHash = keccak256(executionCalldata);
        emit ExecutionEnvelope(
            address(this),
            msg.sender,
            msg.sender,
            type(uint256).max,
            mode,
            0,
            executionHash,
            _callCount(mode, executionCalldata),
            true
        );

        bytes memory hookMsgData = abi.encodeWithSelector(this.execute.selector, mode, executionCalldata);
        bytes memory hookData = _runPreCheck(msg.sender, msg.value, hookMsgData);
        results = _execute(mode, executionCalldata, type(uint256).max, executionHash);
        _runPostCheck(hookData);
        return results;
    }

    /// @notice Agent-only account-native wrapper for whitelist request submission.
    function requestWhitelistAdditionAsAgent(address target, bytes4 selector, string calldata metadata)
        external
        returns (uint256 requestId)
    {
        if (!_isActiveAgentSigner(msg.sender)) revert AgentSessionInvalid(msg.sender);
        address module = whitelistModule;
        if (module == address(0)) revert WhitelistModuleNotConfigured();
        return IWhitelistRequestModule(module).requestWhitelistAddition(target, selector, metadata);
    }

    /// @notice Agent-only account-native wrapper for cancelling pending whitelist request.
    function cancelWhitelistRequestAsAgent(uint256 requestId) external {
        if (!_isActiveAgentSigner(msg.sender)) revert AgentSessionInvalid(msg.sender);
        address module = whitelistModule;
        if (module == address(0)) revert WhitelistModuleNotConfigured();
        IWhitelistRequestModule(module).cancelRequest(requestId);
    }

    /// @notice Owner-only account-native wrapper for approving whitelist request.
    function approveWhitelistRequestAsOwner(uint256 requestId) external onlyOwner {
        address module = whitelistModule;
        if (module == address(0)) revert WhitelistModuleNotConfigured();
        IWhitelistRequestModule(module).approveRequest(requestId, policyHook);
    }

    /// @notice Owner-only account-native wrapper for rejecting whitelist request.
    function rejectWhitelistRequestAsOwner(uint256 requestId) external onlyOwner {
        address module = whitelistModule;
        if (module == address(0)) revert WhitelistModuleNotConfigured();
        IWhitelistRequestModule(module).rejectRequest(requestId);
    }

    function executeAuthorized(
        bytes32 mode,
        bytes calldata executionCalldata,
        uint256 signedNonce,
        uint256 deadline,
        bytes calldata signature
    ) external payable returns (bytes[] memory results) {
        if (deadline != 0 && block.timestamp > deadline) revert SignatureExpired(deadline);
        if (signedNonce != nonce) revert InvalidNonce(nonce, signedNonce);

        bytes32 structHash = keccak256(
            abi.encode(
                EXECUTE_TYPEHASH,
                mode,
                keccak256(executionCalldata),
                signedNonce,
                deadline
            )
        );
        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(digest, signature);
        bool isOwnerSigner = signer == owner;
        if (!isOwnerSigner && !_isActiveAgentSigner(signer)) revert AgentSessionInvalid(signer);
        if (!isOwnerSigner && agentSessionValidator == address(0)) revert InvalidSignature();

        bytes32 executionHash = keccak256(executionCalldata);
        emit ExecutionEnvelope(
            address(this),
            signer,
            msg.sender,
            signedNonce,
            mode,
            deadline,
            executionHash,
            _callCount(mode, executionCalldata),
            !isOwnerSigner
        );

        nonce = signedNonce + 1;

        if (!isOwnerSigner) {
            bytes memory hookMsgData = abi.encodeWithSelector(this.execute.selector, mode, executionCalldata);
            bytes memory hookData = _runPreCheck(msg.sender, msg.value, hookMsgData);
            results = _execute(mode, executionCalldata, signedNonce, executionHash);
            _runPostCheck(hookData);
            return results;
        }

        return _execute(mode, executionCalldata, signedNonce, executionHash);
    }

    function executeFromExecutor(bytes32 mode, bytes calldata executionCalldata)
        external
        payable
        onlyExecutorModule
        returns (bytes[] memory returnData)
    {
        bytes32 executionHash = keccak256(executionCalldata);
        emit ExecutionEnvelope(
            address(this),
            msg.sender,
            msg.sender,
            type(uint256).max,
            mode,
            0,
            executionHash,
            _callCount(mode, executionCalldata),
            false
        );
        return _execute(mode, executionCalldata, type(uint256).max, executionHash);
    }

    function _runPreCheck(
        address msgSender,
        uint256 msgValue,
        bytes memory msgData
    ) internal returns (bytes memory hookData) {
        if (policyHook == address(0)) return "";
        (bool ok, bytes memory ret) = policyHook.call(
            abi.encodeWithSelector(bytes4(keccak256("preCheck(address,uint256,bytes)")), msgSender, msgValue, msgData)
        );
        if (!ok) revert PolicyPreCheckFailed(ret);
        return abi.decode(ret, (bytes));
    }

    function _runPostCheck(bytes memory hookData) internal {
        if (policyHook == address(0)) return;
        (bool ok, bytes memory ret) = policyHook.call(
            abi.encodeWithSelector(bytes4(keccak256("postCheck(bytes)")), hookData)
        );
        if (!ok) revert PolicyPostCheckFailed(ret);
    }

    function _execute(bytes32 mode, bytes memory executionCalldata, uint256 nonceForEvent, bytes32 executionHash)
        internal
        returns (bytes[] memory results)
    {
        bytes1 callType = bytes1(mode);
        if (callType == 0x00) {
            bytes memory result = _executeSingle(executionCalldata, nonceForEvent, executionHash, 0);
            results = new bytes[](1);
            results[0] = result;
            return results;
        }

        if (callType == 0x01) {
            Execution[] memory executions = abi.decode(executionCalldata, (Execution[]));
            results = new bytes[](executions.length);
            for (uint256 i; i < executions.length; ++i) {
                bytes memory packed = abi.encodePacked(
                    executions[i].target,
                    executions[i].value,
                    executions[i].callData
                );
                results[i] = _executeSingle(packed, nonceForEvent, executionHash, i);
            }
            return results;
        }

        revert UnsupportedMode(callType);
    }

    function _executeSingle(
        bytes memory executionCalldata,
        uint256 nonceForEvent,
        bytes32 executionHash,
        uint256 callIndex
    ) internal returns (bytes memory result) {
        if (executionCalldata.length < 52) revert InvalidExecutionCalldata();

        address target;
        uint256 value;
        assembly {
            target := shr(96, mload(add(executionCalldata, 32)))
            value := mload(add(executionCalldata, 52))
        }

        uint256 callDataLen = executionCalldata.length - 52;
        bytes memory callData = new bytes(callDataLen);
        for (uint256 i; i < callDataLen; ++i) {
            callData[i] = executionCalldata[i + 52];
        }

        (bool ok, bytes memory ret) = target.call{ value: value }(callData);
        if (!ok) {
            assembly {
                revert(add(ret, 32), mload(ret))
            }
        }

        emit Executed(
            target,
            value,
            callData.length >= 4 ? bytes4(callData) : bytes4(0),
            nonceForEvent,
            executionHash,
            callIndex
        );
        return ret;
    }

    function _callCount(bytes32 mode, bytes calldata executionCalldata) internal pure returns (uint256) {
        bytes1 callType = bytes1(mode);
        if (callType == 0x00) return 1;
        if (callType == 0x01) {
            Execution[] memory executions = abi.decode(executionCalldata, (Execution[]));
            return executions.length;
        }
        return 0;
    }

    function _isActiveAgentSigner(address signer) internal view returns (bool) {
        if (agentSessionValidator == address(0)) return false;
        IAgentSessionValidator.Session memory session =
            IAgentSessionValidator(agentSessionValidator).getSession(address(this));
        if (session.agentKey == address(0)) return false;
        if (session.agentKey != signer) return false;
        if (session.revoked) return false;
        if (block.timestamp < uint256(session.validAfter)) return false;
        if (session.validUntil != 0 && block.timestamp >= uint256(session.validUntil)) return false;
        return true;
    }

    receive() external payable {}
}

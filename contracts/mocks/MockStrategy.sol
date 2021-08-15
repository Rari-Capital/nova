// @unsupported: ovm
// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.7.6;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {L1_NovaExecutionManager} from "../L1_NovaExecutionManager.sol";

contract MockStrategy {
    event ReentrancyFailed();
    event StealRelayerTokensFailed();

    EvilExternalContract immutable evilContract;
    L1_NovaExecutionManager immutable executionManager;

    uint256 public counter = 1;

    constructor(L1_NovaExecutionManager _executionManager, L1_NovaExecutionManager.StrategyRiskLevel _riskLevel) {
        if (_riskLevel != L1_NovaExecutionManager.StrategyRiskLevel.UNKNOWN) {
            _executionManager.registerSelfAsStrategy(_riskLevel);
        }

        executionManager = _executionManager;
        evilContract = new EvilExternalContract(_executionManager);
    }

    function registerSelfAsStrategy(L1_NovaExecutionManager.StrategyRiskLevel _riskLevel) external {
        executionManager.registerSelfAsStrategy(_riskLevel);
    }

    function thisFunctionWillNotRevert() external pure {}

    function thisFunctionWillModifyState() external {
        counter += 1;
    }

    function thisFunctionWillTransferFromRelayer(address token, uint256 amount) external {
        executionManager.transferFromRelayer(token, amount);
    }

    function thisFunctionWillEmulateAMaliciousExternalContractTryingToStealRelayerTokens(address token, uint256 amount) external {
        if (evilContract.tryToStealRelayerTokens(token, amount)) {
            emit StealRelayerTokensFailed();
        }
    }

    function thisFunctionWillTryToReenter() external {
        try executionManager.exec(0, address(0), "", address(0), 999999999999999999999) {} catch Error(string memory reason) {
            if (keccak256(abi.encodePacked(reason)) == keccak256("ALREADY_EXECUTING")) {
                emit ReentrancyFailed();
            }
        }
    }

    function thisFunctionWillRevert() external pure {
        revert("Not a hard revert!");
    }

    function thisFunctionWillHardRevert() external view {
        executionManager.hardRevert();
    }
}

contract EvilExternalContract {
    L1_NovaExecutionManager immutable executionManager;

    constructor(L1_NovaExecutionManager _executionManager) {
        executionManager = _executionManager;
    }

    function tryToStealRelayerTokens(address token, uint256 amount) external returns (bool stealingFailed) {
        try executionManager.transferFromRelayer(token, amount) {} catch Error(string memory reason) {
            stealingFailed = keccak256(abi.encodePacked(reason)) == keccak256("NOT_CURRENT_STRATEGY");
        }
    }
}

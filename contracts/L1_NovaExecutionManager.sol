// @unsupported: ovm
// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract L1_NovaExecutionManager {
    function exec(
        uint72 execNonce,
        address task,
        bytes memory l1calldata,
        uint256 xDomainMessageGasLimit
    ) public {
        // TODO
    }

    function execWithRecipient(
        uint72 execNonce,
        address task,
        bytes calldata l1calldata,
        uint256 xDomainMessageGasLimit,
        address l2Recipient
    ) external {
        // TODO
    }

    function hardRevert() external {
        // TODO
    }

    function transferFromBot(address token, uint256 amount) external {
        // TODO
    }
}

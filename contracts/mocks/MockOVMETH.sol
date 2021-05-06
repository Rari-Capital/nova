// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.7.6;

import "@eth-optimism/contracts/libraries/standards/UniswapV2ERC20.sol";

contract MockOVMETH is UniswapV2ERC20 {
    constructor() UniswapV2ERC20("Ethereum", "ETH") {
        // 10k premint
        _mint(msg.sender, 10_000 * 10**decimals);
    }
}

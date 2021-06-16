// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.7.6;

import "@eth-optimism/contracts/libraries/standards/UniswapV2ERC20.sol";

contract MockERC20 is UniswapV2ERC20 {
    constructor() UniswapV2ERC20("Some Horrible Imitation Token", "SHIT") {
        // 1000000e18 premint to the deployer:
        mint(1_000_000 * 10**decimals);
    }

    function mint(uint256 amount) public {
        _mint(msg.sender, amount);
    }
}

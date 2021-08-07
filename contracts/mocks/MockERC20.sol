// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.7.6;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    constructor() ERC20("Some Horrible Imitation Token", "SHIT") {
        // 1000000e18 premint to the deployer:
        mint(msg.sender, 1_000_000 * 10**decimals());
    }

    function mint(address recipient, uint256 amount) public {
        _mint(recipient, amount);
    }
}

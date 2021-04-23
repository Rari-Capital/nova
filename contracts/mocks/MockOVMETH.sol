// SPDX-License-Identifier: AGPL-3.0-only
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockOVMETH is ERC20 {
    constructor() ERC20("Ethereum", "ETH") {
        // 10k premint
        _mint(msg.sender, 10_000 * 10**decimals());
    }
}

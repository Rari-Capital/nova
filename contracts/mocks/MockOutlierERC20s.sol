// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.7.6;

contract NoReturnValueERC20 {
    event Transfer(address indexed from, address indexed to, uint256 value);

    function transferFrom(
        address a1,
        address a2,
        uint256 u1
    ) external {
        emit Transfer(a1, a2, u1);
    }
}

contract BadReturnValueERC20 {
    function transferFrom(
        address,
        address,
        uint256
    ) external pure returns (string memory) {
        return "this is not a normal ERC20 return value!";
    }
}

contract ReturnFalseERC20 {
    function transferFrom(
        address,
        address,
        uint256
    ) external pure returns (bool) {
        return false;
    }
}

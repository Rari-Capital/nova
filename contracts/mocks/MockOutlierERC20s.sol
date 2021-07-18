// SPDX-License-Identifier: MIT
pragma solidity 0.7.6;

contract NoReturnValueERC20 {
    function transferFrom(
        address,
        address,
        uint256
    ) external pure {}
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

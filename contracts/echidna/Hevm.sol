// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.7.6;

interface Hevm {
    function warp(uint256) external;

    function roll(uint256) external;

    function store(
        address,
        bytes32,
        bytes32
    ) external;

    function load(address, bytes32) external returns (bytes32);
}

abstract contract HevmHelper {
    bytes20 internal constant CHEAT_CODE = bytes20(uint160(uint256(keccak256("hevm cheat code"))));
    Hevm internal constant hevm = Hevm(address(CHEAT_CODE));
}

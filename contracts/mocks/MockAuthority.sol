// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.7.6;

import {Authority} from "@rari-capital/solmate/src/auth/Auth.sol";

contract MockAuthority {
    function canCall(
        address,
        address,
        bytes4
    ) external pure returns (bool) {
        return true;
    }
}

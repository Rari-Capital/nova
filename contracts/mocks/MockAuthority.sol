// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.7.6;

import {Authority} from "@rari-capital/solmate/src/auth/Auth.sol";

contract MockAuthority is Authority {
    function canCall(
        address,
        address,
        bytes4
    ) external pure override returns (bool) {
        return true;
    }
}

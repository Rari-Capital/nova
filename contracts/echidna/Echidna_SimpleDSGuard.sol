// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.7.6;

import "../external/SimpleDSGuard.sol";

contract Echidna_SimpleDSGuard {
    SimpleDSGuard internal guard;

    constructor() {
        guard = new SimpleDSGuard();
    }

    function permit_and_forbid_should_not_affect_other_users(
        address user1,
        bytes4 sig,
        address user2
    ) public {
        if (user1 == user2 || sig == guard.ANY() || user1 == address(bytes20(guard.ANY()))) {
            return;
        }

        guard.permit(user1, sig);
        // Works as expected:
        assert(guard.canCall(user1, address(0), sig));
        // Does not conflict with other users:
        assert(!guard.canCall(user2, address(0), sig));
        // Does not conflict with other signatures:

        guard.forbid(user1, sig);
        // Works as expected:
        assert(!guard.canCall(user1, address(0), sig));
        // Does not conflict with other users:
        assert(!guard.canCall(user2, address(0), sig));
    }

    function permit_and_forbid_source_to_call_any_should_not_affect_other_users(
        address user1,
        bytes4 sig,
        address user2
    ) public {
        if (user1 == user2 || user1 == address(bytes20(guard.ANY()))) {
            return;
        }

        guard.permitSourceToCallAny(user1);
        // Works as expected:
        assert(guard.canCall(user1, address(0), sig));
        // Does not conflict with other users:
        assert(!guard.canCall(user2, address(0), sig));

        guard.forbidSourceToCallAny(user1);
        // Works as expected:
        assert(!guard.canCall(user1, address(0), sig));
        // Does not conflict with other users:
        assert(!guard.canCall(user2, address(0), sig));
    }

    function permit_and_forbid_any_source_to_call_sig_should_not_affect_other_sigs(
        bytes4 sig,
        bytes4 otherSig,
        address user1
    ) public {
        if (otherSig == sig || sig == guard.ANY()) {
            return;
        }

        guard.permitAnySource(sig);
        // Works as expected:
        assert(guard.canCall(user1, address(0), sig));
        // Does not conflict with other sigs:
        assert(!guard.canCall(user1, address(0), otherSig));

        guard.forbidAnySource(sig);
        // Works as expected:
        assert(!guard.canCall(user1, address(0), sig));
        // Does not conflict with other sigs:
        assert(!guard.canCall(user1, address(0), otherSig));
    }
}

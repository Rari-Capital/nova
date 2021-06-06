// @unsupported: ovm
// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.7.6;

import "../external/SimpleDSGuard.sol";

contract Echidna_SimpleDSGuard {
    SimpleDSGuard internal immutable guard;

    address internal immutable ANY_SENDER;

    constructor() {
        SimpleDSGuard _guard = new SimpleDSGuard();
        guard = _guard;
        ANY_SENDER = address(bytes20(_guard.ANY()));
    }

    function permit_and_forbid_should_not_affect_other_users(
        address user1,
        bytes4 sig,
        address user2
    ) external {
        require(user1 != user2);
        require(user1 != ANY_SENDER);
        require(sig != guard.ANY());

        guard.permit(user1, sig);
        // Works as expected:
        assert(guard.canCall(user1, address(0), sig));
        // Does not conflict with other users:
        assert(!guard.canCall(user2, address(0), sig));

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
    ) external {
        require(user1 != user2);
        require(user1 != ANY_SENDER);

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
    ) external {
        require(otherSig != sig);
        require(sig != guard.ANY());

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

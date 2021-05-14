// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity >=0.4.23;

import "./DSAuth.sol";

/// @notice Permissions whitelist with address-level granularity.
/// @author DappHub (https://github.com/dapphub/ds-guard)
contract DSGuard is DSAuth, DSAuthority {
    event LogPermit(bytes32 indexed src, bytes32 indexed dst, bytes32 indexed sig);

    event LogForbid(bytes32 indexed src, bytes32 indexed dst, bytes32 indexed sig);

    bytes32 public constant ANY = bytes32(uint256(-1));

    mapping(bytes32 => mapping(bytes32 => mapping(bytes32 => bool))) acl;

    function canCall(
        address src_,
        address dst_,
        bytes4 sig
    ) external view override returns (bool) {
        bytes32 src = bytes32(bytes20(src_));
        bytes32 dst = bytes32(bytes20(dst_));

        return
            acl[src][dst][sig] ||
            acl[src][dst][ANY] ||
            acl[src][ANY][sig] ||
            acl[src][ANY][ANY] ||
            acl[ANY][dst][sig] ||
            acl[ANY][dst][ANY] ||
            acl[ANY][ANY][sig] ||
            acl[ANY][ANY][ANY];
    }

    function permitBytes(
        bytes32 src,
        bytes32 dst,
        bytes32 sig
    ) public auth {
        acl[src][dst][sig] = true;
        emit LogPermit(src, dst, sig);
    }

    function forbidBytes(
        bytes32 src,
        bytes32 dst,
        bytes32 sig
    ) public auth {
        acl[src][dst][sig] = false;
        emit LogForbid(src, dst, sig);
    }

    function permit(
        address src,
        address dst,
        bytes32 sig
    ) external {
        permitBytes(bytes32(bytes20(src)), bytes32(bytes20(dst)), sig);
    }

    function forbid(
        address src,
        address dst,
        bytes32 sig
    ) external {
        forbidBytes(bytes32(bytes20(src)), bytes32(bytes20(dst)), sig);
    }
}

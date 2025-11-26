// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.0;

import "hardhat/console.sol";

contract DocumentSign {
    event DocumentDecision(
        bytes32 indexed docId,
        bytes32 indexed docHash,
        address indexed signer,
        bool accepted,      // true = firma aceptada, false = rechazo
        uint256 timestamp
    );

    function recordSignature(bytes32 docId, bytes32 docHash) external {
        emit DocumentDecision(docId, docHash, msg.sender, true, block.timestamp);
    }

    function recordRejection(bytes32 docId, bytes32 docHash) external {
        emit DocumentDecision(docId, docHash, msg.sender, false, block.timestamp);
    }
}
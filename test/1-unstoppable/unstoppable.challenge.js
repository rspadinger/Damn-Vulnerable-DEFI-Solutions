const { ethers } = require("hardhat")
const { expect } = require("chai")

describe("[Challenge] Unstoppable", function () {
    let deployer, player, someUser
    let token, vault, receiverContract

    const TOKENS_IN_VAULT = 1000000n * 10n ** 18n
    const INITIAL_PLAYER_TOKEN_BALANCE = 10n * 10n ** 18n

    before(async function () {
        /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */

        ;[deployer, player, someUser] = await ethers.getSigners()

        token = await (await ethers.getContractFactory("DamnValuableToken", deployer)).deploy()
        vault = await (
            await ethers.getContractFactory("UnstoppableVault", deployer)
        ).deploy(
            token.address,
            deployer.address, // owner
            deployer.address // fee recipient
        )
        expect(await vault.asset()).to.eq(token.address)

        await token.approve(vault.address, TOKENS_IN_VAULT)
        await vault.deposit(TOKENS_IN_VAULT, deployer.address)

        expect(await token.balanceOf(vault.address)).to.eq(TOKENS_IN_VAULT)
        expect(await vault.totalAssets()).to.eq(TOKENS_IN_VAULT)
        expect(await vault.totalSupply()).to.eq(TOKENS_IN_VAULT)
        expect(await vault.maxFlashLoan(token.address)).to.eq(TOKENS_IN_VAULT)
        expect(await vault.flashFee(token.address, TOKENS_IN_VAULT - 1n)).to.eq(0)
        expect(await vault.flashFee(token.address, TOKENS_IN_VAULT)).to.eq(50000n * 10n ** 18n)

        await token.transfer(player.address, INITIAL_PLAYER_TOKEN_BALANCE)
        expect(await token.balanceOf(player.address)).to.eq(INITIAL_PLAYER_TOKEN_BALANCE)

        // Show it's possible for someUser to take out a flash loan
        receiverContract = await (
            await ethers.getContractFactory("ReceiverUnstoppable", someUser)
        ).deploy(vault.address)

        await receiverContract.executeFlashLoan(100n * 10n ** 18n)
    })

    it("Execution", async function () {
        /** CODE YOUR SOLUTION HERE */

        // Sources:

        // https://ethereum.org/en/developers/docs/standards/tokens/erc-4626/
        // https://docs.openzeppelin.com/contracts/4.x/erc4626
        // https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC20/ERC20.sol
        // https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/interfaces/IERC4626.sol
        // https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC20/extensions/ERC4626.sol

        // Go through all methods & check where things could go wrong. I flashLoan(), there are several reverts => totalAssets()
        // should never revert, because the assembly code doesn't make much sense and will never get triggered.

        // The following line looks suspicious:

        // if (convertToShares(totalSupply) != balanceBefore) revert InvalidBalance();

        // We have to understand the following:

        // ? asset of the vault
        // ? totalAssets() [ == asset.balanceOf(address(this)) ] => == balanceBefore
        // ? totalSupply
        // ? convertToShares()

        // Can we somehow create a difference between convertToShares && balanceBefore ?

        // •	asset of the vault => the asset (ERC20 token) specified in the constr of the Vault contract => this is our token

        // •	totalAssets => _asset.balanceOf(address(this)) :: the token balance of our Vault contract

        // •	totalSupply => our Vault contract (ERC4626) inherits from ERC20, which contains a totalSupply() method =>
        // gets updated on every token transfer & mint & burn => _transfer(address from, address to, uint256 value)

        // During setup, we call: await vault.deposit(TOKENS_IN_VAULT, deployer.address) => this calls the mint function,
        // which sets the totalSupply value (to 1M tokens in our case)

        // However, when we call transfer on the "token" (totalSupply == uint256.maxValue), the totalSupply of that token changes,
        // BUT NOT THE TOTALSUPPLY of our Vaul contract !!!

        // So, if we just send some of our (attacker) tokens to the vault, the totalSupply of the vault does not change, however,
        // the totalAssets change => this means, there will be a difference between convertToShares(totalSupply) and totalAssets() and
        // the flashLoan() will revert!

        // function _convertToShares(uint256 assets, Math.Rounding rounding) internal view virtual returns (uint256) {
        //         return assets.mulDiv(totalSupply() + 10 ** _decimalsOffset(), totalAssets() + 1, rounding);
        // }

        // => _decimalOffset() == 0 => this function returns : (A * S+1) / A+1 => if A and S are the same, this function always returns A,
        // however, if they are different (in our case, A = S+10), this function will return a different value than A ( totalAssets() )
        //and the flash loan reverts.

        console.log("*************************** BEFORE ***************************")
        console.log("Total vault assets: ", await vault.totalAssets())
        let totalSupply = await vault.totalSupply()
        console.log("Total supply: ", totalSupply)
        console.log("Shares from total supply: ", await vault.convertToShares(totalSupply))

        await token.connect(player).transfer(vault.address, INITIAL_PLAYER_TOKEN_BALANCE)

        console.log("")
        console.log("*************************** AFTER ***************************")
        console.log("Total vault assets + 10: ", await vault.totalAssets())
        totalSupply = await vault.totalSupply()
        console.log("Total supply: ", totalSupply)
        console.log("Shares from total supply: ", await vault.convertToShares(totalSupply))
    })

    after(async function () {
        /** SUCCESS CONDITIONS - NO NEED TO CHANGE ANYTHING HERE */

        // It is no longer possible to execute flash loans
        await expect(receiverContract.executeFlashLoan(100n * 10n ** 18n)).to.be.reverted
    })
})

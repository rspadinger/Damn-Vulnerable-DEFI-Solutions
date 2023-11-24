const { ethers } = require("hardhat")
const { expect } = require("chai")

describe("[Challenge] Truster", function () {
    let deployer, player
    let token, pool

    const TOKENS_IN_POOL = 1000000n * 10n ** 18n

    before(async function () {
        /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */
        ;[deployer, player] = await ethers.getSigners()

        token = await (await ethers.getContractFactory("DamnValuableToken", deployer)).deploy()
        pool = await (await ethers.getContractFactory("TrusterLenderPool", deployer)).deploy(token.address)
        expect(await pool.token()).to.eq(token.address)

        await token.transfer(pool.address, TOKENS_IN_POOL)
        expect(await token.balanceOf(pool.address)).to.equal(TOKENS_IN_POOL)

        expect(await token.balanceOf(player.address)).to.equal(0)
    })

    it("Execution", async function () {
        /** CODE YOUR SOLUTION HERE */

        // we have a pool contract that holds 1M ERC20 tokens
        // the contract provides flash loans that allow to call any function on any external contract
        // the FL uses the OZ functionCall (low-level call) method => so, our attacker function must succeed =>
        // just consuming all the gas won't work
        // also, we have to pay back the FL, otherwise the method reverts =>
        // so, draining the contract using a direct FL hack won't work
        // but, as the contract uses an ERC20 token, we could try to steal all those tokens using transferFrom(...)
        // however, in order to use transferFrom, the owner first has to approve token spending for the attacker contract
        // as we already know, the FL allows us to call any function on any contract =>
        // so, why not just call token.approve(toAttacker, entireBalance) and then transfer all those tokens to the player address
        // also, in order for the FL to succeed, we have to pay back the loan or simply specify 0 for the loan

        const attackerFactory = await ethers.getContractFactory("TrusterLenderPoolAttacker")
        const attacker = await attackerFactory.deploy()

        await attacker.attack(token.address, pool.address, player.address, TOKENS_IN_POOL)
    })

    after(async function () {
        /** SUCCESS CONDITIONS - NO NEED TO CHANGE ANYTHING HERE */

        // Player has taken all tokens from the pool
        expect(await token.balanceOf(player.address)).to.equal(TOKENS_IN_POOL)
        expect(await token.balanceOf(pool.address)).to.equal(0)
    })
})

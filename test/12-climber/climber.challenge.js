const { ethers, upgrades } = require("hardhat")
const { expect } = require("chai")
const { setBalance } = require("@nomicfoundation/hardhat-network-helpers")

describe("[Challenge] Climber", function () {
    let deployer, proposer, sweeper, player
    let timelock, vault, token

    const VAULT_TOKEN_BALANCE = 10000000n * 10n ** 18n
    const PLAYER_INITIAL_ETH_BALANCE = 1n * 10n ** 17n
    const TIMELOCK_DELAY = 60 * 60

    before(async function () {
        /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */
        ;[deployer, proposer, sweeper, player] = await ethers.getSigners()

        await setBalance(player.address, PLAYER_INITIAL_ETH_BALANCE)
        expect(await ethers.provider.getBalance(player.address)).to.equal(PLAYER_INITIAL_ETH_BALANCE)

        // Deploy the vault behind a proxy using the UUPS pattern,
        // passing the necessary addresses for the `ClimberVault::initialize(address,address,address)` function
        vault = await upgrades.deployProxy(
            await ethers.getContractFactory("ClimberVault", deployer),
            [deployer.address, proposer.address, sweeper.address],
            { kind: "uups" }
        )

        expect(await vault.getSweeper()).to.eq(sweeper.address)
        expect(await vault.getLastWithdrawalTimestamp()).to.be.gt(0)
        expect(await vault.owner()).to.not.eq(ethers.constants.AddressZero)
        expect(await vault.owner()).to.not.eq(deployer.address)

        // Instantiate timelock
        let timelockAddress = await vault.owner()
        timelock = await (await ethers.getContractFactory("ClimberTimelock", deployer)).attach(timelockAddress)

        // Ensure timelock delay is correct and cannot be changed
        expect(await timelock.delay()).to.eq(TIMELOCK_DELAY)
        await expect(timelock.updateDelay(TIMELOCK_DELAY + 1)).to.be.revertedWithCustomError(
            timelock,
            "CallerNotTimelock"
        )

        // Ensure timelock roles are correctly initialized
        expect(await timelock.hasRole(ethers.utils.id("PROPOSER_ROLE"), proposer.address)).to.be.true
        expect(await timelock.hasRole(ethers.utils.id("ADMIN_ROLE"), deployer.address)).to.be.true
        expect(await timelock.hasRole(ethers.utils.id("ADMIN_ROLE"), timelock.address)).to.be.true

        // Deploy token and transfer initial token balance to the vault
        token = await (await ethers.getContractFactory("DamnValuableToken", deployer)).deploy()
        await token.transfer(vault.address, VAULT_TOKEN_BALANCE)
    })

    it("Execution", async function () {
        /** CODE YOUR SOLUTION HERE */

        //to drain the vault, we basically have only 2 possibilities:
        //1: we call sweepFunds on the vault - this won't work, because only the sweeper can call that function and there is no way to get that role
        //2: we use upgrades.upgradeProxy to deploy a new version of the vault that allows us to drain the funds - however, only the admin
        //is allowed to upgrade the implementation contract & this role has already been set in the initializer

        //what seems an interesting attack vector is the execute function in the timelock - there is no access restriction, so, we can call it
        //and the function does not respect the CEI pattern => it checks the OperationState & modifies the execution state AFTER the function call(s)
        //so, maybe we could use this to give ourself the admin role of the vault in order to to deploy a new proxy => after all, the timlock is
        //the owner of the vault, so it should be able to call transferOwnership on the vault (from: OwnableUpgradeable)

        //However, to do so, we need to pass the requirement: getOperationState(id) != OperationState.ReadyForExecution after performing
        //our low-level calls. => let's take a look at that function in the timelockBase =>

        //First of all, the operation needs to be "known" - that's only the case if it has been scheduled before => to schedule an op,
        //we need to have the PROPOSER_ROLE=> which we could get by calling the grantRole function on the timelock (from AccessControl)

        //And we alse have the problem with the delay: if (block.timestamp >= op.readyAtTimestamp) : state = OperationState.ReadyForExecution;
        //with: operations[id].readyAtTimestamp = uint64(block.timestamp) + delay - delay is currently 1 hour
        //but, we can schedule a call to updateDelay and set the delay to 0

        //So, to drain the vault, we can do the following:
        //1: create an attacker contract that executes 4 function calls: updateDelay(0) on timelock ; grantRole(PROPOSER, attacker) on timelock;
        //transferOwnership(player) on vault ; a call to schedule (with all those function calls)
        //in order to pass getOperationState => if op.known... and to get the ReadyForExecution state

        //at this stage, the execute will pass, because we set the delay to 0, we got the PROPOSER role to call the schedule function
        //and we are the owner of the vault proxy contract

        //Now, as we are the owner of the vault proxy, we can deploy a new version of the vault with a simple function that allows us to drain the vault's funds

        // *******************************************************************

        const attacker = await (
            await ethers.getContractFactory("ClimberAttacker", player)
        ).deploy(timelock.address, vault.address)

        await attacker.attack()

        const vaultV2 = await upgrades.upgradeProxy(
            vault.address,
            await ethers.getContractFactory("ClimberVaultV2", player)
        )

        await vaultV2.sweepFunds(token.address)
    })

    after(async function () {
        /** SUCCESS CONDITIONS - NO NEED TO CHANGE ANYTHING HERE */

        expect(await token.balanceOf(vault.address)).to.eq(0)
        expect(await token.balanceOf(player.address)).to.eq(VAULT_TOKEN_BALANCE)
    })
})

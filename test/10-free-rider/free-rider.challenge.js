// Get compiled Uniswap v2 data
const pairJson = require("@uniswap/v2-core/build/UniswapV2Pair.json")
const factoryJson = require("@uniswap/v2-core/build/UniswapV2Factory.json")
const routerJson = require("@uniswap/v2-periphery/build/UniswapV2Router02.json")

const { ethers } = require("hardhat")
const { expect } = require("chai")
const { setBalance } = require("@nomicfoundation/hardhat-network-helpers")

describe("[Challenge] Free Rider", function () {
    let deployer, player, devs
    let weth, token, uniswapFactory, uniswapRouter, uniswapPair, marketplace, nft, devsContract

    // The NFT marketplace will have 6 tokens, at 15 ETH each
    const NFT_PRICE = 15n * 10n ** 18n
    const AMOUNT_OF_NFTS = 6
    const MARKETPLACE_INITIAL_ETH_BALANCE = 90n * 10n ** 18n

    const PLAYER_INITIAL_ETH_BALANCE = 1n * 10n ** 17n

    const BOUNTY = 45n * 10n ** 18n

    // Initial reserves for the Uniswap v2 pool
    const UNISWAP_INITIAL_TOKEN_RESERVE = 15000n * 10n ** 18n
    const UNISWAP_INITIAL_WETH_RESERVE = 9000n * 10n ** 18n

    before(async function () {
        /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */
        ;[deployer, player, devs] = await ethers.getSigners()

        // Player starts with limited ETH balance
        setBalance(player.address, PLAYER_INITIAL_ETH_BALANCE)
        expect(await ethers.provider.getBalance(player.address)).to.eq(PLAYER_INITIAL_ETH_BALANCE)

        // Deploy WETH
        weth = await (await ethers.getContractFactory("WETH", deployer)).deploy()

        // Deploy token to be traded against WETH in Uniswap v2
        token = await (await ethers.getContractFactory("DamnValuableToken", deployer)).deploy()

        // Deploy Uniswap Factory and Router
        uniswapFactory = await new ethers.ContractFactory(factoryJson.abi, factoryJson.bytecode, deployer).deploy(
            ethers.constants.AddressZero // _feeToSetter
        )
        uniswapRouter = await new ethers.ContractFactory(routerJson.abi, routerJson.bytecode, deployer).deploy(
            uniswapFactory.address,
            weth.address
        )

        // Approve tokens, and then create Uniswap v2 pair against WETH and add liquidity
        // The function takes care of deploying the pair automatically
        await token.approve(uniswapRouter.address, UNISWAP_INITIAL_TOKEN_RESERVE)
        await uniswapRouter.addLiquidityETH(
            token.address, // token to be traded against WETH
            UNISWAP_INITIAL_TOKEN_RESERVE, // amountTokenDesired
            0, // amountTokenMin
            0, // amountETHMin
            deployer.address, // to
            (await ethers.provider.getBlock("latest")).timestamp * 2, // deadline
            { value: UNISWAP_INITIAL_WETH_RESERVE }
        )

        // Get a reference to the created Uniswap pair
        uniswapPair = await new ethers.ContractFactory(pairJson.abi, pairJson.bytecode, deployer).attach(
            await uniswapFactory.getPair(token.address, weth.address)
        )
        expect(await uniswapPair.token0()).to.eq(weth.address)
        expect(await uniswapPair.token1()).to.eq(token.address)
        expect(await uniswapPair.balanceOf(deployer.address)).to.be.gt(0)

        // Deploy the marketplace and get the associated ERC721 token
        // The marketplace will automatically mint AMOUNT_OF_NFTS to the deployer (see `FreeRiderNFTMarketplace::constructor`)
        marketplace = await (
            await ethers.getContractFactory("FreeRiderNFTMarketplace", deployer)
        ).deploy(AMOUNT_OF_NFTS, { value: MARKETPLACE_INITIAL_ETH_BALANCE })

        // Deploy NFT contract
        nft = await (await ethers.getContractFactory("DamnValuableNFT", deployer)).attach(await marketplace.token())
        expect(await nft.owner()).to.eq(ethers.constants.AddressZero) // ownership renounced
        expect(await nft.rolesOf(marketplace.address)).to.eq(await nft.MINTER_ROLE())

        // Ensure deployer owns all minted NFTs. Then approve the marketplace to trade them.
        for (let id = 0; id < AMOUNT_OF_NFTS; id++) {
            expect(await nft.ownerOf(id)).to.be.eq(deployer.address)
        }
        await nft.setApprovalForAll(marketplace.address, true)

        // Open offers in the marketplace
        await marketplace.offerMany(
            [0, 1, 2, 3, 4, 5],
            [NFT_PRICE, NFT_PRICE, NFT_PRICE, NFT_PRICE, NFT_PRICE, NFT_PRICE]
        )
        expect(await marketplace.offersCount()).to.be.eq(6)

        // Deploy devs' contract, adding the player as the beneficiary
        devsContract = await (
            await ethers.getContractFactory("FreeRiderRecovery", devs)
        ).deploy(
            player.address, // beneficiary
            nft.address,
            { value: BOUNTY }
        )
    })

    it("Execution", async function () {
        /** CODE YOUR SOLUTION HERE */

        //there is a bug in the FreeRiderNFTMarketplace contract =>
        //in the _buyOne function it is not the seller, but actually they buyer of the NFT who is paid =>
        //payable(_token.ownerOf(tokenId)).sendValue(priceToPay); => at this stage, the buyer is the token owner
        //also, we can buy all six NFT's for the price of one (15 ETH) =>
        //the external buyMany function calls _buyOne in a loop & _buyOne checks msg.value, which remains the same for each iteration

        //so, in order to buy all 6 NFT's, we just need to come up with 15 ETH
        //because we are using th euniswapV2Pair contract, we can get a FL using its swap method =>
        //here are some details : https://www.rareskills.io/post/uniswap-v2-swap-function

        //the swap method calls the "uniswapV2Call" on the target contract if a non-empty bytes data has been provided
        //then, we can buy the NFT's on the marketplace by withdrawing our WETH FL
        //the marketplace performs a safeTransferFrom this means, we have to implement "onERC721Received" in our attacker contract
        //and return the correct selector: IERC721Receiver.onERC721Received.selector
        //then, we need to pay back the FL + a 0.3% fee by converting our ETH into WETH (by calling deposit on our weth instance)
        //and by transferring the borrowed WETH to the uniswapV2Pair contract

        //the only thing left to do is to transfer all NFT's to the devsContract using safeTransferFrom
        //we also need to specify the target address (player) for the bounty as bytes data in safeTransferFrom

        const attackerFactory = await ethers.getContractFactory("FreeRiderAttacker")
        const attacker = await attackerFactory.deploy(
            uniswapPair.address,
            weth.address,
            marketplace.address,
            nft.address,
            devsContract.address,
            player.address,
            { value: PLAYER_INITIAL_ETH_BALANCE }
        )

        await attacker.connect(player).attack()
    })

    after(async function () {
        /** SUCCESS CONDITIONS - NO NEED TO CHANGE ANYTHING HERE */

        // The devs extract all NFTs from its associated contract
        for (let tokenId = 0; tokenId < AMOUNT_OF_NFTS; tokenId++) {
            await nft.connect(devs).transferFrom(devsContract.address, devs.address, tokenId)
            expect(await nft.ownerOf(tokenId)).to.be.eq(devs.address)
        }

        // Exchange must have lost NFTs and ETH
        expect(await marketplace.offersCount()).to.be.eq(0)
        expect(await ethers.provider.getBalance(marketplace.address)).to.be.lt(MARKETPLACE_INITIAL_ETH_BALANCE)

        // Player must have earned all ETH
        expect(await ethers.provider.getBalance(player.address)).to.be.gt(BOUNTY)
        expect(await ethers.provider.getBalance(devsContract.address)).to.be.eq(0)
    })
})

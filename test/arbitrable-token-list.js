/* eslint-disable no-undef */ // Avoid the linter considering truffle elements as undef.

/**
 * NOTE: Tests were adapted from arbitrable-permission-list. As of 04/10/18 t2cr spec, the
 * contract is a white list, not append-only and rechallenges are not possible.
 *
 * Tests that checked for other combinations were removed.
 *
 * TODO: Write tests for other combination of constructor parameters’
 */

// const BigNumber = web3.BigNumber
const {
  expectThrow
} = require('openzeppelin-solidity/test/helpers/expectThrow')

const ArbitrableTokenList = artifacts.require('./ArbitrableTokenList.sol')
const CentralizedArbitrator = artifacts.require('./CentralizedArbitrator.sol')

contract('ArbitrableTokenList', function(accounts) {
  const arbitrator = accounts[1]
  const partyA = accounts[2]
  // const partyB = accounts[3]
  const arbitratorExtraData = 0x08575
  const arbitrationFee = 4
  const challengeReward = 10
  const timeToChallenge = 0
  const metaEvidence = 'evidence'
  const feeGovernor = accounts[1]
  const feeStake = 10
  const halfOfArbitrationPrice = arbitrationFee / 2

  let centralizedArbitrator
  let arbitrableTokenList

  const ITEM_STATUS = {
    ABSENT: 0,
    CLEARED: 1,
    RESUBMITTED: 2,
    REGISTERED: 3,
    SUBMITTED: 4,
    CLEARING_REQUESTED: 5,
    PREVENTIVE_CLEARING_REQUESTED: 6
  }

  // const RULING = { OTHER: 0, REGISTER: 1, CLEAR: 2 }
  const TOKEN_ID = 'pnk'

  const REQUEST = {
    ID: TOKEN_ID,
    arbitrationFeesWaitingTime: 60,
    timeOut: 60,
    contributionsPerSide: [
      [halfOfArbitrationPrice - 1, halfOfArbitrationPrice - 1]
    ]
  }

  const blacklist = false
  const appendOnly = false
  const rechallengePossible = false

  const deployContracts = async () => {
    centralizedArbitrator = await CentralizedArbitrator.new(arbitrationFee, {
      from: arbitrator
    })

    arbitrableTokenList = await ArbitrableTokenList.new(
      centralizedArbitrator.address,
      arbitratorExtraData,
      metaEvidence,
      blacklist,
      appendOnly,
      rechallengePossible,
      challengeReward,
      timeToChallenge,
      feeGovernor,
      feeStake,
      { from: arbitrator }
    )
  }

  describe('queryItems', function() {
    before('setup contract for each test', async () => {
      centralizedArbitrator = await CentralizedArbitrator.new(arbitrationFee, {
        from: arbitrator
      })

      arbitrableTokenList = await ArbitrableTokenList.new(
        centralizedArbitrator.address,
        arbitratorExtraData,
        metaEvidence,
        blacklist,
        appendOnly,
        rechallengePossible,
        challengeReward,
        timeToChallenge,
        feeGovernor,
        feeStake,
        { from: arbitrator }
      )
    })

    before('populate the list', async function() {
      await arbitrableTokenList.requestRegistration(
        TOKEN_ID,
        metaEvidence,
        REQUEST.arbitrationFeesWaitingTime,
        centralizedArbitrator.address,
        { from: partyA, value: challengeReward }
      )
    })

    it('should succesfully retrieve mySubmissions', async function() {
      const cursor = 0
      const count = 1

      const pending = false
      const challenged = false
      const accepted = false
      const rejected = false
      const mySubmissions = true
      const myChallenges = false

      const filter = [
        pending,
        challenged,
        accepted,
        rejected,
        mySubmissions,
        myChallenges
      ]
      const sort = true
      const item = (await arbitrableTokenList.queryItems(
        cursor,
        count,
        filter,
        sort,
        { from: partyA }
      ))[0]

      assert.equal(web3.toUtf8(item[0]), TOKEN_ID)
    })

    it('should succesfully retrieve pending', async function() {
      const cursor = 0
      const count = 1

      const pending = true
      const challenged = false
      const accepted = false
      const rejected = false
      const mySubmissions = false
      const myChallenges = false

      const filter = [
        pending,
        challenged,
        accepted,
        rejected,
        mySubmissions,
        myChallenges
      ]
      const sort = true
      const item = (await arbitrableTokenList.queryItems(
        cursor,
        count,
        filter,
        sort,
        { from: partyA }
      ))[0]

      assert.equal(web3.toUtf8(item[0]), TOKEN_ID)
    })

    it('should revert when not cursor < itemsList.length', async function() {
      const cursor = 1
      const count = 1

      const pending = true
      const challenged = false
      const accepted = false
      const rejected = false
      const mySubmissions = false
      const myChallenges = false

      const filter = [
        pending,
        challenged,
        accepted,
        rejected,
        mySubmissions,
        myChallenges
      ]
      const sort = true

      await expectThrow(
        arbitrableTokenList.queryItems(cursor, count, filter, sort, {
          from: partyA
        })
      )
    })
  })

  describe('requestRegistration', () => {
    beforeEach(async () => {
      await deployContracts()
      assert.equal(
        (await web3.eth.getBalance(arbitrableTokenList.address)).toNumber(),
        0,
        'initial contract balance should be zero for this test'
      )

      await arbitrableTokenList.requestRegistration(
        TOKEN_ID,
        metaEvidence,
        REQUEST.arbitrationFeesWaitingTime,
        centralizedArbitrator.address,
        {
          from: partyA,
          value: challengeReward
        }
      )
    })

    it('should increase and decrease contract balance', async () => {
      assert.equal(
        (await web3.eth.getBalance(arbitrableTokenList.address)).toNumber(),
        challengeReward,
        'contract should have the request reward and arbitration fees'
      )

      await arbitrableTokenList.executeRequest(TOKEN_ID, { from: partyA })

      assert.equal(
        (await web3.eth.getBalance(arbitrableTokenList.address)).toNumber(),
        0,
        'contract should have returned the fees to the submitter'
      )
    })

    it('should change item and agreement state for each submission phase', async () => {
      const firstAgreementId = await arbitrableTokenList.latestAgreementId(
        TOKEN_ID
      )

      const agreementBefore = await arbitrableTokenList.getAgreementInfo(
        firstAgreementId
      )
      assert.equal(agreementBefore[0], partyA, 'partyA should be the creator')
      assert.equal(
        agreementBefore[6].toNumber(),
        0,
        'there should be no disputes'
      )
      assert.equal(agreementBefore[7], false, 'there should be no disputes')
      assert.equal(
        agreementBefore[9].toNumber(),
        0,
        'there should be no ruling'
      )
      assert.equal(
        agreementBefore[10],
        false,
        'request should not have executed yet'
      )

      const itemBefore = await arbitrableTokenList.items(TOKEN_ID)
      assert.equal(
        itemBefore[0].toNumber(),
        ITEM_STATUS.SUBMITTED,
        'item should be in submitted state'
      )
      assert.isAbove(
        itemBefore[1].toNumber(),
        0,
        'time of last action should be above zero'
      )
      assert.equal(itemBefore[2], partyA, 'submitter should be partyA')
      assert.equal(itemBefore[3], 0x0, 'there should be no challenger')
      assert.equal(
        itemBefore[4].toNumber(),
        challengeReward,
        'item balance should be equal challengeReward'
      )
    })
  })

  describe('dispute on requestRegistration', () => {
    beforeEach(async () => {
      await deployContracts()
      assert.equal(
        (await web3.eth.getBalance(arbitrableTokenList.address)).toNumber(),
        0,
        'initial contract balance should be zero for this test'
      )

      await arbitrableTokenList.requestRegistration(
        TOKEN_ID,
        metaEvidence,
        REQUEST.arbitrationFeesWaitingTime,
        centralizedArbitrator.address,
        {
          from: partyA,
          value: challengeReward
        }
      )
    })
  })
})

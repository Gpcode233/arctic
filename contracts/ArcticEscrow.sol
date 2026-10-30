// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title  ArcticEscrow (v2)
 * @notice Milestone-based USDC escrow on Arc.
 *
 * Lifecycle:
 *   1. Payer creates and funds a deal. Funds are pulled into this contract.
 *   2. Payee reviews the terms (milestones, splits, arbiter) and calls acceptDeal.
 *      Until then the payer may refund any milestone.
 *   3. Approval milestones: payee calls markDelivered. The payer then has
 *      `reviewPeriod` seconds to release or dispute. If the payer does neither,
 *      anyone may release once the review period ends.
 *      If the payee never delivers, the payer may refund after `deliverBy`.
 *   4. Schedule milestones: anyone may release once `releaseTime` is reached.
 *      After acceptance the payer can no longer revoke them.
 *   5. Disputes: the optional per-deal arbiter settles a disputed milestone by
 *      releasing it or refunding it. Either party may also settle a dispute
 *      themselves: the payer by releasing, the payee by refunding.
 *
 * Payments are pushed; if a transfer fails (e.g. a blocklisted recipient), the
 * amount is credited to that same recipient in `owed` and can be withdrawn
 * later. A failed payment never redirects funds to someone else and never
 * blocks the milestone.
 */
contract ArcticEscrow is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─────────────────────────────────────────────────────────────────────────
    // Constants
    // ─────────────────────────────────────────────────────────────────────────

    uint256 public constant MAX_MILESTONES    = 20;
    uint256 public constant MAX_SPLITS        = 10;
    uint256 public constant MAX_TITLE_BYTES   = 80;
    uint16  public constant MAX_FEE_BPS       = 100;      // 1 %
    uint32  public constant MIN_REVIEW_PERIOD = 1 hours;
    uint32  public constant MAX_REVIEW_PERIOD = 90 days;
    uint64  public constant MAX_HORIZON       = 3650 days; // deadlines at most ~10 years out
    uint256 public constant MAX_PAGE          = 100;

    // ─────────────────────────────────────────────────────────────────────────
    // Types
    // ─────────────────────────────────────────────────────────────────────────

    enum DealStatus     { Funded, InProgress, Completed }
    enum MilestoneRule  { Approval, Schedule }
    /// @dev Disputed is appended last so existing state indexes are unchanged.
    enum MilestoneState { Pending, Delivered, Released, Refunded, Disputed }

    struct Milestone {
        uint128        amount;
        uint64         releaseTime;   // Schedule: earliest release; 0 for Approval
        uint64         deliverBy;     // Approval: delivery deadline; 0 for Schedule
        uint64         deliveredAt;   // last markDelivered timestamp
        uint64         settledAt;     // release or refund timestamp
        MilestoneRule  rule;
        MilestoneState state;
    }

    struct Split {
        address recipient;
        uint16  bps;
    }

    /// @dev Fee is snapshotted at creation so admin changes never affect live deals.
    struct Deal {
        address    payer;
        address    payee;
        address    arbiter;       // address(0) = no arbiter
        uint128    total;
        uint128    released;      // gross amount released to the payee side
        uint128    refunded;      // amount refunded to the payer
        uint64     createdAt;
        uint64     acceptedAt;    // 0 until the payee accepts
        uint32     reviewPeriod;  // seconds the payer has to review a delivery
        uint16     feeBps;
        DealStatus status;
    }

    struct MilestoneInput {
        string        title;        // 1..80 bytes; only its hash is stored
        uint128       amount;
        MilestoneRule rule;
        uint64        releaseTime;  // Schedule only
        uint64        deliverBy;    // Approval only
    }

    struct SplitInput {
        address recipient;
        uint16  bps;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Errors
    // ─────────────────────────────────────────────────────────────────────────

    error ZeroAddress();
    error NotAContract();
    error InvalidFee();
    error InvalidTitle();
    error InvalidMilestones();
    error InvalidSplits();
    error InvalidAmount();
    error InvalidArbiter();
    error InvalidReviewPeriod();
    error InvalidReleaseTime(uint256 index);
    error InvalidDeadline(uint256 index);
    error FundingMismatch();
    error PayeeEqualsPayer();
    error NotPayer();
    error NotPayee();
    error NotArbiter();
    error Unauthorized();
    error NotAccepted(uint256 dealId);
    error AlreadyAccepted(uint256 dealId);
    error NotDeliverable(uint256 dealId, uint256 index);
    error NotReleasable(uint256 dealId, uint256 index);
    error NotRefundable(uint256 dealId, uint256 index);
    error NotDisputable(uint256 dealId, uint256 index);
    error NotDisputed(uint256 dealId, uint256 index);
    error DealNotFound(uint256 dealId);
    error DealCompleted(uint256 dealId);
    error MilestoneNotFound(uint256 dealId, uint256 index);
    error NothingToWithdraw();
    error InsufficientExcess();

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    /// @dev Title emitted here; storage holds only keccak256(title).
    event DealCreated(
        uint256 indexed dealId,
        address indexed payer,
        address indexed payee,
        string          title,
        uint128         total,
        address         arbiter,
        uint32          reviewPeriod
    );
    event DealAccepted(uint256 indexed dealId);
    event MilestoneDelivered(uint256 indexed dealId, uint256 index);
    event MilestoneDisputed(uint256 indexed dealId, uint256 index);
    event DisputeResolved(uint256 indexed dealId, uint256 index, bool releasedToPayee);
    event MilestoneReleased(uint256 indexed dealId, uint256 index, uint128 gross, uint128 fee);
    event MilestoneRefunded(uint256 indexed dealId, uint256 index, uint128 amount);
    event SplitPaid(
        uint256 indexed dealId,
        uint256         milestoneIndex,
        address indexed recipient,
        uint128         amount
    );
    /// @dev Push transfer failed; amount credited to `recipient` in `owed`.
    event PaymentDeferred(address indexed recipient, uint256 amount);
    event Withdrawn(address indexed account, uint256 amount);
    event Rescued(address indexed token, address indexed to, uint256 amount);
    event FeeBpsUpdated(uint16 bps);
    event TreasuryUpdated(address treasury);

    // ─────────────────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────────────────

    IERC20  public immutable usdc;
    address public treasury;
    uint16  public feeBps;
    uint256 public dealCount;

    /// @notice USDC this contract owes to deals and to `owed` balances.
    uint256 public liabilities;
    /// @notice Payments that could not be pushed, claimable via withdraw().
    mapping(address => uint256) public owed;

    mapping(uint256 => Deal)        private _deals;
    mapping(uint256 => bytes32)     private _dealTitleHashes;
    mapping(uint256 => Milestone[]) private _milestones;
    mapping(uint256 => mapping(uint256 => bytes32)) private _milestoneTitleHashes;
    mapping(uint256 => Split[])     private _splits;
    mapping(address => uint256[])   private _dealsByPayer;
    mapping(address => uint256[])   private _dealsByPayee;

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @param _usdc     USDC ERC-20 token address.
     * @param _treasury Fee recipient.
     * @param _feeBps   Protocol fee in bps (max 100 = 1 %).
     * @param _owner    Admin; should be a multisig on mainnet.
     */
    constructor(address _usdc, address _treasury, uint16 _feeBps, address _owner) Ownable(_owner) {
        if (_usdc == address(0) || _treasury == address(0)) revert ZeroAddress();
        if (_usdc.code.length == 0) revert NotAContract();
        if (_feeBps > MAX_FEE_BPS) revert InvalidFee();

        usdc     = IERC20(_usdc);
        treasury = _treasury;
        feeBps   = _feeBps;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Deal creation and acceptance
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Create and fund a new escrow deal.
     * @param payee        Payee wallet; may not be msg.sender or address(0).
     * @param arbiter      Optional dispute resolver; address(0) for none.
     * @param title        Deal title, 1-80 bytes.
     * @param milestonesIn Milestone definitions (1-20).
     * @param splitsIn     Payout recipients (1-10); bps must sum to 10 000.
     * @param reviewPeriod Seconds the payer has to review each delivery.
     */
    function createDeal(
        address                   payee,
        address                   arbiter,
        string           calldata title,
        MilestoneInput[] calldata milestonesIn,
        SplitInput[]     calldata splitsIn,
        uint32                    reviewPeriod
    ) external nonReentrant whenNotPaused returns (uint256 dealId) {
        if (payee == address(0)) revert ZeroAddress();
        if (payee == msg.sender) revert PayeeEqualsPayer();
        if (arbiter != address(0) && (arbiter == msg.sender || arbiter == payee)) revert InvalidArbiter();
        if (reviewPeriod < MIN_REVIEW_PERIOD || reviewPeriod > MAX_REVIEW_PERIOD) revert InvalidReviewPeriod();
        {
            uint256 len = bytes(title).length;
            if (len == 0 || len > MAX_TITLE_BYTES) revert InvalidTitle();
        }

        uint256 total = _validateInputs(milestonesIn, splitsIn);

        dealId = dealCount++;
        _fund(total);
        _writeDeal(dealId, payee, arbiter, title, total, reviewPeriod);
        _writeMilestones(dealId, milestonesIn);
        _writeSplits(dealId, splitsIn);

        _dealsByPayer[msg.sender].push(dealId);
        _dealsByPayee[payee].push(dealId);

        emit DealCreated(dealId, msg.sender, payee, title, uint128(total), arbiter, reviewPeriod);
    }

    /**
     * @notice Payee accepts the deal terms. Locks in Schedule milestones and
     *         stops the payer from refunding Approval milestones before `deliverBy`.
     */
    function acceptDeal(uint256 dealId) external {
        Deal storage deal = _activeDeal(dealId);
        if (msg.sender != deal.payee) revert NotPayee();
        if (deal.acceptedAt != 0) revert AlreadyAccepted(dealId);
        deal.acceptedAt = uint64(block.timestamp);
        emit DealAccepted(dealId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Approval flow
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Payee submits an Approval milestone, or resubmits a disputed one.
     *         Starts a fresh review period for the payer.
     */
    function markDelivered(uint256 dealId, uint256 index) external {
        Deal storage deal = _activeDeal(dealId);
        if (msg.sender != deal.payee) revert NotPayee();
        if (deal.acceptedAt == 0) revert NotAccepted(dealId);

        Milestone storage ms = _milestone(dealId, index);
        if (
            ms.rule != MilestoneRule.Approval ||
            (ms.state != MilestoneState.Pending && ms.state != MilestoneState.Disputed)
        ) revert NotDeliverable(dealId, index);

        ms.state       = MilestoneState.Delivered;
        ms.deliveredAt = uint64(block.timestamp);
        emit MilestoneDelivered(dealId, index);
    }

    /// @notice Payer disputes a delivered milestone during its review period.
    function disputeMilestone(uint256 dealId, uint256 index) external {
        Deal storage deal = _activeDeal(dealId);
        if (msg.sender != deal.payer) revert NotPayer();

        Milestone storage ms = _milestone(dealId, index);
        if (
            ms.state != MilestoneState.Delivered ||
            block.timestamp >= uint256(ms.deliveredAt) + deal.reviewPeriod
        ) revert NotDisputable(dealId, index);

        ms.state = MilestoneState.Disputed;
        emit MilestoneDisputed(dealId, index);
    }

    /// @notice Arbiter settles a disputed milestone.
    function resolveDispute(uint256 dealId, uint256 index, bool releaseToPayee) external nonReentrant {
        Deal storage deal = _activeDeal(dealId);
        if (deal.arbiter == address(0) || msg.sender != deal.arbiter) revert NotArbiter();

        Milestone storage ms = _milestone(dealId, index);
        if (ms.state != MilestoneState.Disputed) revert NotDisputed(dealId, index);

        emit DisputeResolved(dealId, index, releaseToPayee);
        if (releaseToPayee) _release(dealId, index);
        else _refund(dealId, index);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Release and refund
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Release a milestone to the split recipients.
     *   Approval, Delivered: payer any time; anyone after the review period.
     *   Approval, Disputed:  payer only (conceding the dispute).
     *   Schedule:            anyone, once accepted and releaseTime is reached.
     */
    function releaseMilestone(uint256 dealId, uint256 index) external nonReentrant {
        Deal storage deal = _activeDeal(dealId);
        Milestone storage ms = _milestone(dealId, index);
        if (!_canRelease(deal, ms)) revert NotReleasable(dealId, index);
        _release(dealId, index);
    }

    /**
     * @notice Refund a milestone to the payer.
     *   Payee: Pending, Delivered or Disputed, any time.
     *   Payer: Pending only, and only before acceptance or, for Approval
     *          milestones, after the delivery deadline has passed.
     */
    function refundMilestone(uint256 dealId, uint256 index) external nonReentrant {
        Deal storage deal = _activeDeal(dealId);
        Milestone storage ms = _milestone(dealId, index);
        MilestoneState s = ms.state;

        if (msg.sender == deal.payee) {
            if (s != MilestoneState.Pending && s != MilestoneState.Delivered && s != MilestoneState.Disputed) {
                revert NotRefundable(dealId, index);
            }
        } else if (msg.sender == deal.payer) {
            bool allowed = s == MilestoneState.Pending && (
                deal.acceptedAt == 0 ||
                (ms.rule == MilestoneRule.Approval && block.timestamp > ms.deliverBy)
            );
            if (!allowed) revert NotRefundable(dealId, index);
        } else {
            revert Unauthorized();
        }

        _refund(dealId, index);
    }

    /// @notice Withdraw payments that could not be pushed earlier.
    function withdraw() external nonReentrant {
        uint256 amount = owed[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        owed[msg.sender] = 0;
        liabilities     -= amount;
        usdc.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Admin
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Set the protocol fee (applies to new deals only).
    function setFeeBps(uint16 bps) external onlyOwner {
        if (bps > MAX_FEE_BPS) revert InvalidFee();
        feeBps = bps;
        emit FeeBpsUpdated(bps);
    }

    function setTreasury(address t) external onlyOwner {
        if (t == address(0)) revert ZeroAddress();
        treasury = t;
        emit TreasuryUpdated(t);
    }

    /// @notice Pause new deal creation only. Existing deals keep working.
    function pause() external onlyOwner   { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    /**
     * @notice Recover tokens sent here by mistake. For USDC, only the balance
     *         above `liabilities` can be recovered, so escrowed funds are untouchable.
     */
    function rescue(address token, address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (token == address(usdc)) {
            uint256 bal = usdc.balanceOf(address(this));
            if (bal < liabilities || amount > bal - liabilities) revert InsufficientExcess();
        }
        IERC20(token).safeTransfer(to, amount);
        emit Rescued(token, to, amount);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Views
    // ─────────────────────────────────────────────────────────────────────────

    function getDeal(uint256 dealId) external view returns (Deal memory) {
        return _deals[dealId];
    }

    function getMilestones(uint256 dealId) external view returns (Milestone[] memory) {
        return _milestones[dealId];
    }

    function getMilestoneTitleHash(uint256 dealId, uint256 index) external view returns (bytes32) {
        return _milestoneTitleHashes[dealId][index];
    }

    function getDealTitleHash(uint256 dealId) external view returns (bytes32) {
        return _dealTitleHashes[dealId];
    }

    function getSplits(uint256 dealId) external view returns (Split[] memory) {
        return _splits[dealId];
    }

    function dealCountByPayer(address payer) external view returns (uint256) {
        return _dealsByPayer[payer].length;
    }

    function dealCountByPayee(address payee) external view returns (uint256) {
        return _dealsByPayee[payee].length;
    }

    /// @notice Paginated deal ids for a payer (limit capped at MAX_PAGE).
    function dealsByPayer(address payer, uint256 offset, uint256 limit) external view returns (uint256[] memory) {
        return _page(_dealsByPayer[payer], offset, limit);
    }

    /// @notice Paginated deal ids for a payee (limit capped at MAX_PAGE).
    function dealsByPayee(address payee, uint256 offset, uint256 limit) external view returns (uint256[] memory) {
        return _page(_dealsByPayee[payee], offset, limit);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internal helpers
    // ─────────────────────────────────────────────────────────────────────────

    function _validateInputs(
        MilestoneInput[] calldata milestonesIn,
        SplitInput[]     calldata splitsIn
    ) internal view returns (uint256 total) {
        uint256 mLen = milestonesIn.length;
        if (mLen == 0 || mLen > MAX_MILESTONES) revert InvalidMilestones();
        uint256 sLen = splitsIn.length;
        if (sLen == 0 || sLen > MAX_SPLITS) revert InvalidSplits();

        uint256 horizon = block.timestamp + MAX_HORIZON;
        for (uint256 i; i < mLen; ++i) {
            MilestoneInput calldata m = milestonesIn[i];
            { uint256 tl = bytes(m.title).length; if (tl == 0 || tl > MAX_TITLE_BYTES) revert InvalidTitle(); }
            if (m.amount == 0) revert InvalidAmount();
            if (m.rule == MilestoneRule.Schedule) {
                if (m.releaseTime <= block.timestamp || m.releaseTime > horizon) revert InvalidReleaseTime(i);
            } else {
                if (m.deliverBy <= block.timestamp || m.deliverBy > horizon) revert InvalidDeadline(i);
            }
            total += m.amount;
        }
        if (total > type(uint128).max) revert InvalidAmount();

        uint256 bpsSum = 0;
        for (uint256 i; i < sLen; ++i) {
            if (splitsIn[i].recipient == address(0) || splitsIn[i].bps == 0) revert InvalidSplits();
            bpsSum += splitsIn[i].bps;
        }
        if (bpsSum != 10_000) revert InvalidSplits();
    }

    function _fund(uint256 total) internal {
        uint256 before = usdc.balanceOf(address(this));
        usdc.safeTransferFrom(msg.sender, address(this), total);
        if (usdc.balanceOf(address(this)) - before != total) revert FundingMismatch();
        liabilities += total;
    }

    function _writeDeal(
        uint256          dealId,
        address          payee,
        address          arbiter,
        string  calldata title,
        uint256          total,
        uint32           reviewPeriod
    ) internal {
        Deal storage d   = _deals[dealId];
        d.payer          = msg.sender;
        d.payee          = payee;
        d.arbiter        = arbiter;
        d.total          = uint128(total);
        d.createdAt      = uint64(block.timestamp);
        d.reviewPeriod   = reviewPeriod;
        d.feeBps         = feeBps;
        d.status         = DealStatus.Funded;
        _dealTitleHashes[dealId] = keccak256(bytes(title));
    }

    function _writeMilestones(uint256 dealId, MilestoneInput[] calldata ms) internal {
        uint256 len = ms.length;
        for (uint256 i; i < len; ++i) {
            MilestoneInput calldata m = ms[i];
            bool scheduled = m.rule == MilestoneRule.Schedule;
            _milestones[dealId].push(Milestone({
                amount:      m.amount,
                releaseTime: scheduled ? m.releaseTime : 0,
                deliverBy:   scheduled ? 0 : m.deliverBy,
                deliveredAt: 0,
                settledAt:   0,
                rule:        m.rule,
                state:       MilestoneState.Pending
            }));
            _milestoneTitleHashes[dealId][i] = keccak256(bytes(m.title));
        }
    }

    function _writeSplits(uint256 dealId, SplitInput[] calldata ss) internal {
        uint256 len = ss.length;
        for (uint256 i; i < len; ++i) {
            _splits[dealId].push(Split({recipient: ss[i].recipient, bps: ss[i].bps}));
        }
    }

    function _canRelease(Deal storage deal, Milestone storage ms) internal view returns (bool) {
        if (ms.rule == MilestoneRule.Schedule) {
            return deal.acceptedAt != 0
                && ms.state == MilestoneState.Pending
                && block.timestamp >= ms.releaseTime;
        }
        if (ms.state == MilestoneState.Delivered) {
            return msg.sender == deal.payer
                || block.timestamp >= uint256(ms.deliveredAt) + deal.reviewPeriod;
        }
        if (ms.state == MilestoneState.Disputed) {
            return msg.sender == deal.payer;
        }
        return false;
    }

    function _release(uint256 dealId, uint256 index) internal {
        Deal storage deal    = _deals[dealId];
        Milestone storage ms = _milestones[dealId][index];

        uint256 gross = ms.amount;
        uint256 fee   = (gross * deal.feeBps) / 10_000;
        uint256 net   = gross - fee;

        // Effects
        ms.state      = MilestoneState.Released;
        ms.settledAt  = uint64(block.timestamp);
        deal.released = uint128(uint256(deal.released) + gross);
        _updateStatus(dealId, deal);
        emit MilestoneReleased(dealId, index, uint128(gross), uint128(fee));

        // Interactions
        _pay(treasury, fee);
        _distributeSplits(dealId, index, net);
    }

    function _refund(uint256 dealId, uint256 index) internal {
        Deal storage deal    = _deals[dealId];
        Milestone storage ms = _milestones[dealId][index];
        uint128 amount       = ms.amount;

        // Effects
        ms.state      = MilestoneState.Refunded;
        ms.settledAt  = uint64(block.timestamp);
        deal.refunded = deal.refunded + amount;
        _updateStatus(dealId, deal);
        emit MilestoneRefunded(dealId, index, amount);

        // Interactions
        _pay(deal.payer, amount);
    }

    function _distributeSplits(uint256 dealId, uint256 milestoneIdx, uint256 net) internal {
        Split[] storage ss = _splits[dealId];
        uint256 len   = ss.length;
        uint256 accum = 0;
        for (uint256 i; i < len; ++i) {
            // The last recipient takes the rounding remainder
            uint256 share = i + 1 == len ? net - accum : (net * ss[i].bps) / 10_000;
            accum += share;
            if (share == 0) continue;
            _pay(ss[i].recipient, share);
            emit SplitPaid(dealId, milestoneIdx, ss[i].recipient, uint128(share));
        }
    }

    /**
     * @dev Push `amount` to `to`. On failure, credit it to `to` in `owed`
     *      instead of reverting, so one bad recipient cannot block a milestone
     *      and funds are never redirected to anyone else.
     */
    function _pay(address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok, bytes memory ret) = address(usdc).call(abi.encodeCall(IERC20.transfer, (to, amount)));
        bool success = ok && (ret.length == 0 || (ret.length >= 32 && abi.decode(ret, (uint256)) == 1));
        if (success) {
            liabilities -= amount;
        } else {
            owed[to] += amount;
            emit PaymentDeferred(to, amount);
        }
    }

    function _updateStatus(uint256 dealId, Deal storage deal) internal {
        Milestone[] storage ms = _milestones[dealId];
        uint256 len = ms.length;
        for (uint256 i; i < len; ++i) {
            MilestoneState s = ms[i].state;
            if (s != MilestoneState.Released && s != MilestoneState.Refunded) {
                deal.status = DealStatus.InProgress;
                return;
            }
        }
        deal.status = DealStatus.Completed;
    }

    function _activeDeal(uint256 dealId) internal view returns (Deal storage deal) {
        deal = _deals[dealId];
        if (deal.payer == address(0)) revert DealNotFound(dealId);
        if (deal.status == DealStatus.Completed) revert DealCompleted(dealId);
    }

    function _milestone(uint256 dealId, uint256 index) internal view returns (Milestone storage) {
        Milestone[] storage list = _milestones[dealId];
        if (index >= list.length) revert MilestoneNotFound(dealId, index);
        return list[index];
    }

    function _page(uint256[] storage ids, uint256 offset, uint256 limit) internal view returns (uint256[] memory out) {
        uint256 len = ids.length;
        if (offset >= len) return new uint256[](0);
        if (limit > MAX_PAGE) limit = MAX_PAGE;
        uint256 end = offset + limit;
        if (end > len) end = len;
        out = new uint256[](end - offset);
        for (uint256 i; i < out.length; ++i) out[i] = ids[offset + i];
    }
}
